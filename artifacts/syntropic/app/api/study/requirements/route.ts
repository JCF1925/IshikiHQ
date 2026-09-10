export const dynamic = 'force-dynamic'
import { z } from 'zod'
import { auth } from '@/auth'
import { apiError, apiSuccess, parseBody } from '@/lib/api'
import { prisma } from '@/lib/db'
import { assertOwnedStudyProgram, StudyOwnershipError } from '@/lib/study-domain'
import { studyStatusSchema } from '@/lib/study-validation'

const schema = z.object({
  programId: z.string().cuid(),
  name: z.string().trim().min(1).max(500),
  type: z.string().trim().min(1).max(100),
  requiredCredits: z.coerce.number().positive().optional().nullable(),
  status: studyStatusSchema.default('planned'),
  notes: z.string().trim().max(5000).optional().nullable(),
})

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const parsed = await parseBody(request, schema)
  if (!parsed.success) return parsed.response
  try {
    await assertOwnedStudyProgram((session.user as any).id, parsed.data.programId)
    return apiSuccess(await prisma.studyRequirement.create({ data: parsed.data }), { status: 201 })
  } catch (error) {
    if (error instanceof StudyOwnershipError) return apiError('NOT_FOUND', error.message, 404)
    throw error
  }
}
