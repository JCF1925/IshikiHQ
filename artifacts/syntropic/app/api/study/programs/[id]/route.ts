export const dynamic = 'force-dynamic'
import { auth } from '@/auth'
import { apiError, apiSuccess, parseBody } from '@/lib/api'
import { prisma } from '@/lib/db'
import { assertOwnedStudyProgram, StudyOwnershipError } from '@/lib/study-domain'
import { studyProgramUpdateSchema } from '@/lib/study-validation'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const parsed = await parseBody(request, studyProgramUpdateSchema)
  if (!parsed.success) return parsed.response
  const { id } = await params
  try {
    await assertOwnedStudyProgram((session.user as any).id, id)
    return apiSuccess(await prisma.studyProgram.update({ where: { id }, data: parsed.data as any }))
  } catch (error) {
    if (error instanceof StudyOwnershipError) return apiError('NOT_FOUND', error.message, 404)
    throw error
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const { id } = await params
  try {
    await assertOwnedStudyProgram((session.user as any).id, id)
    await prisma.studyProgram.delete({ where: { id } })
    return apiSuccess({ deleted: true })
  } catch (error) {
    if (error instanceof StudyOwnershipError) return apiError('NOT_FOUND', error.message, 404)
    throw error
  }
}
