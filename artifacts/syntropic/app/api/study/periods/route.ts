export const dynamic = 'force-dynamic'
import { auth } from '@/auth'
import { apiError, apiSuccess, parseBody } from '@/lib/api'
import { prisma } from '@/lib/db'
import { assertOwnedStudyProgram, StudyOwnershipError } from '@/lib/study-domain'
import { studyPeriodSchema } from '@/lib/study-validation'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const parsed = await parseBody(request, studyPeriodSchema)
  if (!parsed.success) return parsed.response
  try {
    await assertOwnedStudyProgram((session.user as any).id, parsed.data.programId)
    return apiSuccess(await prisma.studyTeachingPeriod.create({ data: parsed.data }), { status: 201 })
  } catch (error) {
    if (error instanceof StudyOwnershipError) return apiError('NOT_FOUND', error.message, 404)
    throw error
  }
}
