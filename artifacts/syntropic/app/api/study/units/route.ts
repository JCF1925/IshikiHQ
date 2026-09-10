export const dynamic = 'force-dynamic'
import { auth } from '@/auth'
import { apiError, apiSuccess, parseBody } from '@/lib/api'
import { prisma } from '@/lib/db'
import { assertOwnedStudyProgram, StudyOwnershipError } from '@/lib/study-domain'
import { studyUnitSchema } from '@/lib/study-validation'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const parsed = await parseBody(request, studyUnitSchema)
  if (!parsed.success) return parsed.response
  try {
    await assertOwnedStudyProgram((session.user as any).id, parsed.data.programId)
    if (parsed.data.teachingPeriodId) {
      const period = await prisma.studyTeachingPeriod.findFirst({ where: { id: parsed.data.teachingPeriodId, programId: parsed.data.programId } })
      if (!period) return apiError('VALIDATION_ERROR', 'Teaching period does not belong to this program', 400)
    }
    if (parsed.data.requirementId) {
      const requirement = await prisma.studyRequirement.findFirst({ where: { id: parsed.data.requirementId, programId: parsed.data.programId } })
      if (!requirement) return apiError('VALIDATION_ERROR', 'Requirement does not belong to this program', 400)
    }
    return apiSuccess(await prisma.studyUnit.create({ data: parsed.data as any }), { status: 201 })
  } catch (error) {
    if (error instanceof StudyOwnershipError) return apiError('NOT_FOUND', error.message, 404)
    throw error
  }
}
