export const dynamic = "force-dynamic";
import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { apiError, parseBody } from '@/lib/api'
import { workProposalDecisionSchema } from '@/lib/validation'
import { buildCompensationTimeline } from '@/lib/work-compensation'

function salaryIncreaseFailure(action: 'review' | 'delete', error: unknown) {
  const diagnosticId = randomUUID()
  console.error(`[income] salary increase ${action} failed`, {
    diagnosticId,
    error: error instanceof Error ? error.name : 'unknown',
  })
  return apiError(
    'INTERNAL_ERROR',
    action === 'review'
      ? 'Pay change could not be reviewed. Try again.'
      : 'Pay change could not be deleted. Try again.',
    500,
    { diagnosticId },
  )
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const userId = (session.user as any).id
  const { id } = await params
  const parsed = await parseBody(request, workProposalDecisionSchema)
  if (!parsed.success) return parsed.response
  const requestedStatus = parsed.data.action === 'approve' ? 'approved' : 'rejected'
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Conditional update is the atomic claim: exactly one concurrent reviewer
      // can move a pending proposal, and only that transaction can run effects.
      const claim = await tx.salaryIncrease.updateMany({
        where: { id, userId, status: 'pending' },
        data: { status: requestedStatus, decidedAt: new Date(), decisionNotes: parsed.data.decisionNotes || null },
      })
      if (!claim.count) {
        const current = await tx.salaryIncrease.findFirst({ where: { id, userId } })
        return { won: false as const, current }
      }

      // Different proposals on one IncomeSource can be approved concurrently.
      // Serialise their materialisation, not just each proposal row, so each
      // rebuild sees the preceding winner's approved timeline.
      const claimed = await tx.salaryIncrease.findUniqueOrThrow({ where: { id }, select: { incomeSourceId: true } })
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${claimed.incomeSourceId}, 0))`
      const decision = await tx.salaryIncrease.findUniqueOrThrow({
        where: { id },
        include: {
          income: {
            include: {
              increases: { where: { status: 'approved' }, orderBy: [{ effectiveDate: 'asc' }, { createdAt: 'asc' }] },
              employmentRoles: { where: { userId }, select: { id: true, startDate: true } },
            },
          },
        },
      })
      if (requestedStatus === 'approved') {
        for (const role of decision.income.employmentRoles) {
          const timeline = buildCompensationTimeline({
            baseAmount: decision.income.amount,
            baseSuperRate: decision.income.superRate,
            sourceStartDate: decision.income.startDate,
            roleStartDate: role.startDate,
            changes: decision.income.increases,
          })
          for (const point of timeline) {
            await tx.employmentCompensation.upsert({
              where: { roleId_effectiveFrom: { roleId: role.id, effectiveFrom: point.effectiveFrom } },
              create: {
                userId, roleId: role.id, effectiveFrom: point.effectiveFrom, amount: point.amount,
                frequency: decision.income.frequency, hoursPerWeek: decision.income.hoursPerWeek,
                superRate: point.superRate, notes: decision.notes,
              },
              update: {
                amount: point.amount, frequency: decision.income.frequency,
                hoursPerWeek: decision.income.hoursPerWeek, superRate: point.superRate,
              },
            })
          }
        }
      }
      return { won: true as const, current: decision }
    })
    if (!result.won) {
      if (!result.current) return apiError('NOT_FOUND', 'Pay change proposal not found', 404)
      if (result.current.status === requestedStatus) return NextResponse.json({ proposal: result.current, idempotent: true })
      return NextResponse.json({
        error: {
          code: 'CONFLICT',
          message: 'Pay change was already reviewed. Refresh the list to see its current status.',
        },
        proposal: result.current,
      }, { status: 409 })
    }
    return NextResponse.json(result.current)
  } catch (error) {
    return salaryIncreaseFailure('review', error)
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const userId = (session.user as any).id
  const { id } = await params
  try {
    const existing = await prisma.salaryIncrease.findFirst({ where: { id, userId }, select: { status: true } })
    if (!existing) return apiError('NOT_FOUND', 'Pay change proposal not found', 404)
    if (existing.status !== 'pending') {
      return apiError('CONFLICT', 'Reviewed pay proposals are retained as audit history', 409)
    }
    // Re-check pending in the deletion predicate so a concurrent reviewer cannot
    // approve after the read above and have their audit history removed.
    const deleted = await prisma.salaryIncrease.deleteMany({ where: { id, userId, status: 'pending' } })
    if (!deleted.count) return apiError('CONFLICT', 'Pay change was reviewed while deletion was requested. Refresh the list to see its current status.', 409)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return salaryIncreaseFailure('delete', error)
  }
}
