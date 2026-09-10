export const dynamic = 'force-dynamic'
import { z } from 'zod'
import { auth } from '@/auth'
import { apiError, apiSuccess, parseBody } from '@/lib/api'
import { prisma } from '@/lib/db'
import { assertOwnedStudyProgram, StudyOwnershipError } from '@/lib/study-domain'
import { studyMethodSchema } from '@/lib/study-validation'

const schema = z.object({
  programId: z.string().cuid().optional().nullable(),
  name: z.string().trim().min(1).max(500),
  method: studyMethodSchema,
  effectiveFrom: z.coerce.date(),
  effectiveTo: z.coerce.date().optional().nullable(),
  maximumValue: z.coerce.number().positive().optional().nullable(),
  rules: z.array(z.object({
    label: z.string().trim().min(1).max(100),
    minimum: z.number().finite().optional(),
    maximum: z.number().finite().optional(),
    value: z.number().finite().optional(),
    outcome: z.string().trim().max(100).optional(),
  })).min(1).max(100),
}).refine((value) => !value.effectiveTo || value.effectiveTo >= value.effectiveFrom, {
  path: ['effectiveTo'], message: 'Effective-to date must not precede effective-from date',
})

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const parsed = await parseBody(request, schema)
  if (!parsed.success) return parsed.response
  const userId = (session.user as any).id
  try {
    if (parsed.data.programId) await assertOwnedStudyProgram(userId, parsed.data.programId)
    return apiSuccess(await prisma.studyGradingScale.create({ data: { ...parsed.data, userId } as any }), { status: 201 })
  } catch (error) {
    if (error instanceof StudyOwnershipError) return apiError('NOT_FOUND', error.message, 404)
    throw error
  }
}
