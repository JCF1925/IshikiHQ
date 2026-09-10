export const dynamic = 'force-dynamic'

import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { apiError, apiSuccess } from '@/lib/api'
import { healthClaimReportWhere } from '@/lib/account-security'
import {
  applyHealthClaimReviewEdits,
  validateClaimData,
  claimFingerprint,
  type HealthClaimKind,
  type MedicareClaimData,
  type PrivateHealthClaimData,
} from '@/lib/health-claims'
import { deleteFile } from '@/lib/s3'

async function ownedImport(id: string, userId: string, options?: { liveOnly?: boolean }) {
  return prisma.healthClaimImport.findFirst({
    where: options?.liveOnly ? { id, ...healthClaimReportWhere(userId) } : { id, userId },
    include: {
      rows: { orderBy: { rowNumber: 'asc' } },
      auditEvents: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          action: true,
          rowNumber: true,
          previousStatus: true,
          nextStatus: true,
          changedFields: true,
          actorUserId: true,
          createdAt: true,
          actor: { select: { name: true } },
        },
      },
    },
  })
}

function changedFields(before: Record<string, unknown>, after: Record<string, unknown>) {
  return Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
    .filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]))
}

function unresolvedOcrErrors(errors: unknown, changed: string[]) {
  if (!Array.isArray(errors)) return []
  return errors.filter((error): error is string => {
    if (typeof error !== 'string') return false
    const match = error.match(/^OCR confidence is low for ([A-Za-z0-9]+);/)
    return Boolean(match && !changed.includes(match[1]))
  })
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const userId = (session.user as { id?: string }).id
  const { id } = await context.params
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const record = await ownedImport(id, userId)
  if (!record) return apiError('NOT_FOUND', 'Import not found', 404)
  return apiSuccess(record)
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const userId = (session.user as { id?: string }).id
  const { id } = await context.params
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const current = await ownedImport(id, userId, { liveOnly: true })
  if (!current) return apiError('NOT_FOUND', 'Import not found', 404)

  let body: any
  try {
    body = await request.json()
  } catch {
    return apiError('VALIDATION_ERROR', 'Request body must be valid JSON', 400)
  }
  const action = body?.action

  if (action === 'save') {
    if (current.status !== 'review') return apiError('LOCKED', 'This import is no longer in review', 423)
    if (!Array.isArray(body.rows)) return apiError('VALIDATION_ERROR', 'Rows are required', 400)
    const known = new Map(current.rows.map((row) => [row.id, row]))
    for (const change of body.rows) {
      if (!known.has(String(change?.id))) return apiError('NOT_FOUND', 'Import row not found', 404)
    }
    await prisma.$transaction(async (tx) => {
      for (const change of body.rows) {
        const existing = known.get(String(change?.id))!
        if (change.excluded === true || change.status === 'excluded') {
          if (existing.status !== 'excluded' || JSON.stringify(existing.errors ?? []) !== '[]') {
            await tx.healthClaimImportRow.update({ where: { id: existing.id }, data: { status: 'excluded', errors: [] } })
            await tx.healthClaimImportAudit.create({
              data: {
                importId: id,
                userId,
                actorUserId: userId,
                action: 'row_excluded',
                rowNumber: existing.rowNumber,
                previousStatus: existing.status,
                nextStatus: 'excluded',
              },
            })
          }
          continue
        }
        const kind = current.kind as HealthClaimKind
        const reviewData = kind === 'medicare'
          ? applyHealthClaimReviewEdits(kind, existing.data as MedicareClaimData, change.data)
          : applyHealthClaimReviewEdits(kind, existing.data as PrivateHealthClaimData, change.data)
        const result = validateClaimData(kind, reviewData)
        const fields = changedFields(existing.data as Record<string, unknown>, result.data as Record<string, unknown>)
        result.errors.push(...unresolvedOcrErrors(existing.errors, fields))
        const nextStatus = result.errors.length ? 'invalid' : 'valid'
        const errorsChanged = JSON.stringify(existing.errors ?? []) !== JSON.stringify(result.errors)
        const statusChanged = existing.status !== nextStatus
        await tx.healthClaimImportRow.update({
          where: { id: existing.id },
          data: {
            data: result.data,
            errors: result.errors,
            fingerprint: claimFingerprint(kind, result.data),
            status: nextStatus,
          },
        })
        if (fields.length || errorsChanged || statusChanged) {
          await tx.healthClaimImportAudit.create({
            data: {
              importId: id,
              userId,
              actorUserId: userId,
              action: existing.status === 'excluded' ? 'row_included' : 'row_edited',
              rowNumber: existing.rowNumber,
              previousStatus: existing.status,
              nextStatus,
              changedFields: fields,
            },
          })
        }
      }
    })
    const updated = await ownedImport(id, userId)
    return apiSuccess(updated)
  }

  if (action === 'cancel') {
    if (current.status === 'confirmed') return apiError('LOCKED', 'Confirmed imports cannot be canceled', 423)
    try { await deleteFile(current.storageKey) } catch { /* cleanup is best effort */ }
    await prisma.$transaction(async (tx) => {
      await tx.healthClaimImportAudit.create({
        data: { importId: id, userId, actorUserId: userId, action: 'review_canceled' },
      })
      await tx.healthClaimImportRow.deleteMany({ where: { importId: id, userId } })
      await tx.healthClaimImport.update({ where: { id }, data: { status: 'canceled', canceledAt: new Date(), deletedAt: new Date() } })
    })
    return apiSuccess({ ok: true, status: 'canceled' })
  }

  if (action !== 'confirm') return apiError('VALIDATION_ERROR', 'Choose save, confirm, or cancel', 400)
  if (current.status === 'confirmed') return apiSuccess({ ok: true, status: 'confirmed', id })
  if (current.status !== 'review') return apiError('LOCKED', 'This import is no longer available for confirmation', 423)
  const invalid = current.rows.filter((row) => row.status === 'invalid')
  if (invalid.length) return apiError('VALIDATION_ERROR', 'Exclude or correct every invalid row before confirming', 400, { invalidRows: invalid.map((row) => ({ id: row.id, rowNumber: row.rowNumber, errors: row.errors })) })

  let policyId: string | null = null
  if (current.kind === 'private_health') {
    policyId = typeof body.policyId === 'string' ? body.policyId : null
    if (!policyId) return apiError('VALIDATION_ERROR', 'Choose an existing private health policy before confirming', 400)
    const policy = await prisma.phiPolicy.findFirst({ where: { id: policyId, userId }, select: { id: true } })
    if (!policy) return apiError('NOT_FOUND', 'Private health policy not found', 404)
  }

  const confirmed = await prisma.$transaction(async (tx) => {
    const claimed = await tx.healthClaimImport.updateMany({ where: { id, userId, status: 'review' }, data: { status: 'confirmed', confirmedAt: new Date() } })
    if (claimed.count !== 1) return false
    for (const row of current.rows.filter((item) => item.status === 'valid')) {
      const data = row.data as Record<string, any>
      if (current.kind === 'medicare') {
        const inserted = await tx.medicareClaim.createMany({
          data: [{
            userId,
            serviceDate: new Date(`${data.serviceDate}T00:00:00.000Z`),
            description: String(data.description),
            itemNumber: data.itemNumber || null,
            provider: data.provider || null,
            scheduleFee: data.scheduleFee ?? null,
            feeCharged: data.feeCharged ?? null,
            benefitPaid: data.benefitPaid ?? null,
            outOfPocket: data.outOfPocket ?? 0,
            financialYear: data.financialYear || null,
            isForecast: Boolean(data.isForecast),
            countsToSafetyNet: data.countsToSafetyNet !== false,
            sourceImportId: id,
            sourceRowId: row.id,
            importFingerprint: row.fingerprint,
          }],
          skipDuplicates: true,
        })
        if (inserted.count === 0) {
          await tx.healthClaimImportRow.update({ where: { id: row.id }, data: { status: 'duplicate' } })
          continue
        }
      } else {
        const inserted = await tx.phiClaim.createMany({
          data: [{
            userId,
            policyId: policyId!,
            claimNumber: data.claimNumber || null,
            serviceDate: new Date(`${data.serviceDate}T00:00:00.000Z`),
            provider: data.provider || null,
            serviceType: data.serviceType || null,
            description: String(data.description),
            itemNumber: data.itemNumber || null,
            chargedAmount: data.chargedAmount ?? null,
            benefitAmount: data.benefitAmount ?? null,
            outOfPocket: data.outOfPocket ?? 0,
            benefitDetail: data.benefitDetail || null,
            claimStatus: data.claimStatus || null,
            sourceImportId: id,
            sourceRowId: row.id,
            importFingerprint: row.fingerprint,
          }],
          skipDuplicates: true,
        })
        if (inserted.count === 0) {
          await tx.healthClaimImportRow.update({ where: { id: row.id }, data: { status: 'duplicate' } })
          continue
        }
      }
      await tx.healthClaimImportRow.update({ where: { id: row.id }, data: { status: 'confirmed' } })
    }
    await tx.healthClaimImportAudit.create({
      data: { importId: id, userId, actorUserId: userId, action: 'import_confirmed' },
    })
    return true
  })
  return confirmed ? apiSuccess({ ok: true, status: 'confirmed', id }) : apiError('CONFLICT', 'Import changed before confirmation; reload the preview', 409)
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const userId = (session.user as { id?: string }).id
  const { id } = await context.params
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const current = await prisma.healthClaimImport.findFirst({ where: { id, userId, deletedAt: null } })
  if (!current) return apiError('NOT_FOUND', 'Import not found', 404)
  if (!current.deletedAt) {
    try { await deleteFile(current.storageKey) } catch { /* cleanup is best effort */ }
    await prisma.$transaction(async (tx) => {
      await tx.healthClaimImportAudit.create({
        data: { importId: id, userId, actorUserId: userId, action: 'source_removed' },
      })
      await tx.healthClaimImportRow.deleteMany({ where: { importId: id, userId } })
      await tx.healthClaimImport.update({ where: { id }, data: { deletedAt: new Date(), parseErrors: ['Source file removed by user'] } })
    })
  }
  return apiSuccess({ ok: true })
}