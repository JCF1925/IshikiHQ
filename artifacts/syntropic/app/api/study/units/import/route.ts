export const dynamic = 'force-dynamic'
import { auth } from '@/auth'
import { apiError, apiSuccess, parseBody } from '@/lib/api'
import { prisma } from '@/lib/db'
import { previewUnitImport } from '@/lib/study-calculations'
import { assertOwnedStudyProgram, StudyOwnershipError } from '@/lib/study-domain'
import { studyUnitImportRequestSchema } from '@/lib/study-validation'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const parsed = await parseBody(request, studyUnitImportRequestSchema)
  if (!parsed.success) return parsed.response
  try {
    const userId = (session.user as any).id
    if ('batchId' in parsed.data) {
      const batch = await prisma.studyUnitImportBatch.findFirst({
        where: { id: parsed.data.batchId, program: { userId } },
        select: {
          id: true,
          programId: true,
          createdAt: true,
          undoneAt: true,
          units: {
            select: { id: true, code: true, name: true, creditPoints: true, status: true },
            orderBy: { code: 'asc' },
          },
        },
      })
      if (!batch) return apiError('NOT_FOUND', 'Import batch not found', 404)
      if (batch.undoneAt) return apiError('CONFLICT', 'This import has already been undone', 409)
      if (parsed.data.action === 'undo-preview') {
        return apiSuccess({
          batchId: batch.id,
          programId: batch.programId,
          createdAt: batch.createdAt,
          units: batch.units,
          count: batch.units.length,
        })
      }

      const undoneAt = new Date()
      const undone = await prisma.$transaction(async (tx) => {
        const claimed = await tx.studyUnitImportBatch.updateMany({
          where: { id: batch.id, program: { userId }, undoneAt: null },
          data: { undoneAt },
        })
        if (claimed.count !== 1) return 0
        const removed = await tx.studyUnit.deleteMany({ where: { importBatchId: batch.id } })
        return removed.count
      })
      if (undone === 0) return apiError('CONFLICT', 'This import has already been undone or has no remaining units', 409)
      return apiSuccess({ batchId: batch.id, removed: undone })
    }

    const { action, programId, teachingPeriodId, rows, mapping } = parsed.data
    await assertOwnedStudyProgram(userId, programId)
    if (teachingPeriodId) {
      const period = await prisma.studyTeachingPeriod.findFirst({ where: { id: teachingPeriodId, programId } })
      if (!period) return apiError('VALIDATION_ERROR', 'Teaching period does not belong to this program', 400)
    }
    const preview = previewUnitImport(rows, mapping)
    const existing = await prisma.studyUnit.findMany({
      where: { programId, code: { in: preview.valid.map((row) => row.code) } },
      select: { code: true },
    })
    const existingCodes = new Set(existing.map((unit) => unit.code.toLowerCase()))
    const duplicates: Array<{ row: number; code: string; reason: 'already_exists' | 'duplicate_in_file' }> = preview.valid
      .filter((row) => existingCodes.has(row.code.toLowerCase()))
      .map((row) => ({ row: row.row, code: row.code, reason: 'already_exists' as const }))
    preview.valid = preview.valid.filter((row) => !existingCodes.has(row.code.toLowerCase()))
    const fileDuplicates = preview.errors
      .filter((error) => error.message.startsWith('Duplicate unit code'))
      .map((error) => ({
        row: error.row,
        code: String(rows[error.row - 1]?.[mapping.code] ?? '').trim(),
        reason: 'duplicate_in_file' as const,
      }))
    preview.errors = preview.errors.filter((error) => !error.message.startsWith('Duplicate unit code'))
    duplicates.push(...fileDuplicates)
    preview.canCommit = preview.errors.length === 0
    const reviewed = { ...preview, duplicates, skipped: duplicates.length }
    if (action === 'preview') return apiSuccess(reviewed)
    if (!preview.canCommit) return apiError('VALIDATION_ERROR', 'CSV has errors; no units were imported', 400, reviewed)
    const result = await prisma.$transaction(async (tx) => {
      const batch = await tx.studyUnitImportBatch.create({ data: { programId } })
      const created = await tx.studyUnit.createMany({
        data: preview.valid.map((unit) => ({
          code: unit.code,
          name: unit.name,
          creditPoints: unit.creditPoints,
          status: unit.status,
          programId,
          teachingPeriodId: teachingPeriodId ?? null,
          importBatchId: batch.id,
        })) as any,
        skipDuplicates: true,
      })
      if (created.count === 0) {
        await tx.studyUnitImportBatch.delete({ where: { id: batch.id } })
        return { batch: null, created, units: [] }
      }
      const units = await tx.studyUnit.findMany({
        where: { importBatchId: batch.id },
        select: { id: true, code: true, name: true, creditPoints: true, status: true },
        orderBy: { code: 'asc' },
      })
      return { batch, created, units }
    })
    return apiSuccess({
      created: result.created.count,
      imported: result.created.count,
      skipped: preview.total - result.created.count,
      total: preview.total,
      batchId: result.batch?.id ?? null,
      units: result.units,
    })
  } catch (error) {
    if (error instanceof StudyOwnershipError) return apiError('NOT_FOUND', error.message, 404)
    throw error
  }
}
