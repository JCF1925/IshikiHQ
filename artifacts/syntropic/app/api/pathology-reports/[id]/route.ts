export const dynamic = 'force-dynamic'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { apiError, apiSuccess, parseBody } from '@/lib/api'
import { confirmationIssues, pathologyDraftSchema, reviewActionSchema } from '@/lib/pathology'
import { deleteFile, verifyUploadedFile } from '@/lib/s3'
import { Prisma } from '@prisma/client'

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Unauthorized', 401)
  const parsed = await parseBody(request, reviewActionSchema)
  if (!parsed.success) return parsed.response
  const { id } = await context.params
  const userId = (session.user as any).id
  const current = await prisma.pathologyReport.findFirst({ where: { id, userId, retentionState: { not: 'deleted' } } })
  if (!current) return apiError('NOT_FOUND', 'Report not found', 404)
  if (current.status === 'confirmed' && parsed.data.action !== 'request_deletion') return apiError('LOCKED', 'Confirmed reviews cannot be changed', 423)

  if (parsed.data.action === 'upload_complete') {
    if (current.status !== 'uploaded' || current.retentionState !== 'retained') return apiError('CONFLICT', 'Upload is not awaiting verification', 409)
    const expectedChecksum = Buffer.from(current.sha256, 'hex').toString('base64')
    if (!await verifyUploadedFile(current.cloudStoragePath, current.byteSize, expectedChecksum)) {
      return apiError('VALIDATION_ERROR', 'Uploaded bytes do not match the prepared report', 400)
    }
    const completed = await prisma.$transaction(async (tx) => {
      const claim = await tx.pathologyReport.updateMany({ where: { id, userId, status: 'uploaded', retentionState: 'retained', updatedAt: current.updatedAt }, data: { status: 'in_review' } })
      if (claim.count !== 1) return false
      await tx.pathologyAuditEvent.create({ data: { reportId: id, userId, action: 'uploaded' } })
      return true
    })
    return completed ? apiSuccess({ ok: true }) : apiError('CONFLICT', 'Report changed while the upload was verified', 409)
  }
  if (parsed.data.action === 'request_deletion') {
    if (current.retentionState === 'retained') {
      const claimed = await prisma.$transaction(async (tx) => {
        const claim = await tx.pathologyReport.updateMany({ where: { id, userId, retentionState: 'retained', status: { not: 'extracting' }, updatedAt: current.updatedAt }, data: { retentionState: 'deletion_requested' } })
        if (claim.count !== 1) return false
        await tx.pathologyExport.updateMany({ where: { reportId: id, consumedAt: null }, data: { consumedAt: new Date() } })
        await tx.pathologyAuditEvent.create({ data: { reportId: id, userId, action: 'deletion_requested' } })
        return true
      })
      if (!claimed) return apiError('CONFLICT', 'Report changed while deletion was requested', 409)
    }
    try {
      if (current.cloudStoragePath) await deleteFile(current.cloudStoragePath)
    } catch {
      return apiError('INTERNAL_ERROR', 'Deletion is queued but the private original could not yet be removed. Retry deletion.', 500)
    }
    await prisma.$transaction(async (tx) => {
      await tx.labPanel.updateMany({ where: { sourceReportId: id }, data: { cloudStoragePath: null } })
      await tx.pathologyReport.update({ where: { id }, data: { retentionState: 'deleted', deletedAt: new Date(), cloudStoragePath: '', extractedData: Prisma.DbNull, confirmedSnapshot: Prisma.DbNull } })
      await tx.pathologyAuditEvent.create({ data: { reportId: id, userId, action: 'deleted' } })
    })
    return apiSuccess({ ok: true })
  }
  if (parsed.data.action === 'reject') {
    const reason = parsed.data.reason ?? null
    const rejected = await prisma.$transaction(async (tx) => {
      const claim = await tx.pathologyReport.updateMany({ where: { id, userId, status: 'in_review', retentionState: 'retained', updatedAt: current.updatedAt }, data: { status: 'rejected', reviewedAt: new Date() } })
      if (claim.count !== 1) return false
      await tx.pathologyAuditEvent.create({ data: { reportId: id, userId, action: 'rejected', afterData: { reason } } })
      return true
    })
    return rejected ? apiSuccess({ ok: true }) : apiError('CONFLICT', 'Report changed before it could be rejected', 409)
  }
  if (parsed.data.action === 'save') {
    const draft = parsed.data.draft
    const saved = await prisma.$transaction(async (tx) => {
      const claim = await tx.pathologyReport.updateMany({ where: { id, userId, status: 'in_review', retentionState: 'retained', updatedAt: current.updatedAt }, data: { extractedData: draft } })
      if (claim.count !== 1) return false
      await tx.pathologyAuditEvent.create({ data: { reportId: id, userId, action: 'corrected', beforeData: current.extractedData ?? undefined, afterData: draft } })
      return true
    })
    return saved ? apiSuccess({ ok: true }) : apiError('CONFLICT', 'Report changed before this review could be saved', 409)
  }

  if (parsed.data.action !== 'confirm') return apiError('VALIDATION_ERROR', 'Unsupported review action', 400)
  const draft = pathologyDraftSchema.parse(parsed.data.draft)
  const issues = confirmationIssues(draft)
  if (issues.length) return apiError('VALIDATION_ERROR', 'Resolve or remove all unresolved results before confirmation', 400, { issues })
  const collectedDate = draft.report.collectedAt ? new Date(draft.report.collectedAt) : new Date()
  const confirmed = await prisma.$transaction(async (tx) => {
    const claim = await tx.pathologyReport.updateMany({ where: { id, userId, status: 'in_review', retentionState: 'retained', updatedAt: current.updatedAt }, data: { status: 'extracting' } })
    if (claim.count !== 1) return null
    const panels = []
    for (const group of draft.panels) {
      panels.push(await tx.labPanel.create({ data: {
        userId, sourceReportId: id, name: group.name || draft.report.title, category: 'pathology', discipline: group.discipline,
        collectedDate, provider: draft.report.provider, cloudStoragePath: current.cloudStoragePath,
        summary: group.comments, notes: draft.report.comments,
        results: { create: group.results.map((result) => ({
          userId, analyte: result.analyte, resultType: result.resultType, value: result.value ?? null, valueText: result.valueText ?? null,
          unit: result.unit ?? null, refLow: result.refLow ?? null, refHigh: result.refHigh ?? null, flag: result.flag ?? null,
          notes: [result.collectedAt, result.comment].filter(Boolean).join(' · ') || null,
        })) },
      } }))
    }
    await tx.pathologyReport.update({ where: { id }, data: {
      extractedData: draft, confirmedSnapshot: draft,
      status: 'confirmed', reviewedAt: new Date(),
      auditEvents: { create: { userId, action: 'confirmed', beforeData: current.extractedData ?? undefined, afterData: draft } },
    } })
    return panels
  })
  return confirmed ? apiSuccess({ ok: true, panelIds: confirmed.map((panel) => panel.id) }) : apiError('CONFLICT', 'Report changed before it could be confirmed', 409)
}