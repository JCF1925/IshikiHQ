export const dynamic = 'force-dynamic'
import { auth } from '@/auth'
import { apiError, apiSuccess } from '@/lib/api'
import { prisma } from '@/lib/db'
import { studySuggestionKey } from '@/lib/study-calculations'

export async function GET() {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  return apiSuccess(await prisma.studyTaskSuggestion.findMany({
    where: { userId: (session.user as any).id },
    include: { program: { select: { name: true } }, assessment: { select: { name: true } } },
    orderBy: [{ status: 'asc' }, { dueAt: 'asc' }],
  }))
}

// Generates pending records only. It deliberately never creates Tasks.
export async function POST() {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const userId = (session.user as any).id
  const programs = await prisma.studyProgram.findMany({
    where: { userId, status: { in: ['active', 'planned'] } },
    include: {
      periods: true,
      units: { include: { assessments: { where: { dueAt: { not: null }, status: { in: ['active', 'planned'] } } } } },
    },
  })
  const suggestions: Array<any> = []
  for (const program of programs) {
    for (const unit of program.units) for (const assessment of unit.assessments) {
      const key = studySuggestionKey('assessment', assessment.id, assessment.dueAt)
      suggestions.push({ userId, programId: program.id, assessmentId: assessment.id, kind: 'assessment', idempotencyKey: key, title: `${unit.code}: ${assessment.name}`, dueAt: assessment.dueAt })
    }
    for (const period of program.periods) for (const [kind, dueAt] of [['census', period.censusDate], ['withdrawal', period.withdrawalDate]] as const) {
      if (!dueAt) continue
      suggestions.push({ userId, programId: program.id, kind, idempotencyKey: studySuggestionKey(kind, period.id, dueAt), title: `${period.name} ${kind} deadline`, dueAt })
    }
  }
  if (suggestions.length) await prisma.studyTaskSuggestion.createMany({ data: suggestions, skipDuplicates: true })
  return apiSuccess({ generated: suggestions.length, suggestions: await prisma.studyTaskSuggestion.findMany({ where: { userId, status: 'pending' }, orderBy: { dueAt: 'asc' } }) })
}
