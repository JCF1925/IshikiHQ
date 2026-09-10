export const dynamic = 'force-dynamic'
import { auth } from '@/auth'
import { apiError, apiSuccess, parseBody } from '@/lib/api'
import { prisma } from '@/lib/db'
import { suggestionDecisionSchema } from '@/lib/study-validation'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const parsed = await parseBody(request, suggestionDecisionSchema)
  if (!parsed.success) return parsed.response
  const userId = (session.user as any).id
  const { id } = await params
  const suggestion = await prisma.studyTaskSuggestion.findFirst({ where: { id, userId }, include: { program: true } })
  if (!suggestion) return apiError('NOT_FOUND', 'Suggestion not found', 404)
  if (suggestion.status !== 'pending') return apiSuccess(suggestion)
  if (parsed.data.decision === 'reject') {
    const result = await prisma.$transaction(async (tx) => {
      // The conditional transition is the claim. A concurrent approval that
      // already won cannot be overwritten by a rejection (and vice versa).
      await tx.studyTaskSuggestion.updateMany({
        where: { id, userId, status: 'pending' },
        data: { status: 'rejected', decidedAt: new Date() },
      })
      return tx.studyTaskSuggestion.findUnique({ where: { id } })
    })
    return apiSuccess(result)
  }
  const result = await prisma.$transaction(async (tx) => {
    // Claim with a conditional write so concurrent/retried approvals cannot
    // create duplicate tasks. Side effects only run for the winning approval.
    const claim = await tx.studyTaskSuggestion.updateMany({
      where: { id, userId, status: 'pending' },
      data: { status: 'approved', decidedAt: new Date() },
    })
    const current = await tx.studyTaskSuggestion.findUnique({ where: { id } })
    if (!current || claim.count === 0) return current
    const task = await tx.task.create({
      data: { userId, title: current.title, dueDate: current.dueAt, priority: current.kind === 'assessment' ? 'high' : 'medium', tags: ['study', current.kind], moduleRef: `study-suggestion:${current.id}` },
    })
    let eventId: string | null = null
    const sync = current.kind === 'assessment' ? suggestion.program.syncAssessmentCalendar : suggestion.program.syncDeadlineCalendar
    if (sync && current.dueAt && suggestion.program.calendarCategory) {
      const event = await tx.event.create({
        data: { userId, title: current.title, type: suggestion.program.calendarCategory, startDatetime: current.dueAt, allDay: true, peopleRefs: [], tags: ['study', current.kind], moduleRef: `study-suggestion:${current.id}` },
      })
      eventId = event.id
    }
    return tx.studyTaskSuggestion.update({ where: { id }, data: { taskId: task.id, eventId } })
  })
  return apiSuccess(result)
}
