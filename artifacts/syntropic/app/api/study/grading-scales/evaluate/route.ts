export const dynamic = 'force-dynamic'
import { z } from 'zod'
import { auth } from '@/auth'
import { apiError, apiSuccess, parseBody } from '@/lib/api'
import { prisma } from '@/lib/db'
import { evaluateEffectiveGradingScale } from '@/lib/study-calculations'
import { studyMethodSchema } from '@/lib/study-validation'

const schema = z.object({
  programId: z.string().cuid().optional().nullable(),
  method: studyMethodSchema,
  input: z.coerce.number().finite(),
  evaluatedAt: z.coerce.date(),
})

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const parsed = await parseBody(request, schema)
  if (!parsed.success) return parsed.response
  const userId = (session.user as any).id
  const scales = await prisma.studyGradingScale.findMany({
    where: { userId, ...(parsed.data.programId ? { OR: [{ programId: parsed.data.programId }, { programId: null }] } : { programId: null }) },
    select: { id: true, name: true, method: true, effectiveFrom: true, effectiveTo: true, maximumValue: true, rules: true },
  })
  try {
    const result = evaluateEffectiveGradingScale(scales.map((scale) => ({
      ...scale,
      maximumValue: scale.maximumValue == null ? null : Number(scale.maximumValue),
      rules: scale.rules as any,
    })), parsed.data.method, parsed.data.input, parsed.data.evaluatedAt)
    return apiSuccess(result)
  } catch (error: any) {
    return apiError('VALIDATION_ERROR', error?.message ?? 'Could not evaluate grading scale', 400)
  }
}
