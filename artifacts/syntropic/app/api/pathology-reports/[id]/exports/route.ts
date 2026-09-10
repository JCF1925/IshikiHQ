export const dynamic = 'force-dynamic'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { apiError, apiSuccess, parseBody } from '@/lib/api'
import { exportPreviewHash, exportRequestSchema, newExportToken, pathologyDraftSchema, selectExport, sha256 } from '@/lib/pathology'

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Unauthorized', 401)
  const parsed = await parseBody(request, exportRequestSchema)
  if (!parsed.success) return parsed.response
  const { id } = await context.params
  const userId = (session.user as any).id
  const report = await prisma.pathologyReport.findFirst({ where: { id, userId, status: 'confirmed', retentionState: 'retained' } })
  if (!report) return apiError('NOT_FOUND', 'Confirmed report not found', 404)
  const snapshot = pathologyDraftSchema.safeParse(report.confirmedSnapshot)
  if (!snapshot.success) return apiError('INTERNAL_ERROR', 'Confirmed report snapshot is invalid', 500)
  const selection = selectExport(snapshot.data, parsed.data.panelIds)
  if (!selection.panels.length) return apiError('VALIDATION_ERROR', 'Select at least one valid panel', 400)
  const expectedHash = exportPreviewHash(parsed.data.format, selection)
  if (expectedHash !== parsed.data.previewHash) return apiError('CONFLICT', 'The export preview changed. Review it again before exporting.', 409)
  const token = newExportToken()
  await prisma.pathologyExport.create({ data: {
    reportId: id, userId, tokenHash: sha256(token), format: parsed.data.format, selection,
    previewHash: expectedHash, expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  } })
  return apiSuccess({ downloadUrl: `/api/pathology-exports/${token}`, expiresIn: 600 }, { status: 201 })
}