export const dynamic = 'force-dynamic'
import { auth } from '@/auth'
import { apiError, apiSuccess, parseBody } from '@/lib/api'
import { prisma } from '@/lib/db'
import { assertOwnedStudyUnit, StudyOwnershipError } from '@/lib/study-domain'
import { studyAssessmentSchema } from '@/lib/study-validation'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const parsed = await parseBody(request, studyAssessmentSchema)
  if (!parsed.success) return parsed.response
  try {
    await assertOwnedStudyUnit((session.user as any).id, parsed.data.unitId)
    const { components, ...assessment } = parsed.data
    return apiSuccess(await prisma.studyAssessment.create({
      data: { ...(assessment as any), components: { create: components as any } },
      include: { components: true },
    }), { status: 201 })
  } catch (error) {
    if (error instanceof StudyOwnershipError) return apiError('NOT_FOUND', error.message, 404)
    throw error
  }
}
