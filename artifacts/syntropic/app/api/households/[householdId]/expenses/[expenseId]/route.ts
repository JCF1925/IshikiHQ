export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { assertImmutableCreator, calculateExpenseAllocations, expenseRecurrenceUpdate, HouseholdAccessError, requireHouseholdCapability } from '@/lib/household'

async function expenseFor(householdId: string, expenseId: string) {
  const expense = await prisma.householdExpense.findFirst({ where: { id: expenseId, householdId }, include: { allocations: true } })
  if (!expense) throw new HouseholdAccessError('Expense not found', 404)
  return expense
}

export async function PATCH(request: Request, { params }: { params: Promise<{ householdId: string; expenseId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id as string
  const { householdId, expenseId } = await params
  try {
    await requireHouseholdCapability(userId, householdId, 'update')
    const existing = await expenseFor(householdId, expenseId)
    const body = await request.json()
    assertImmutableCreator(existing.createdById, body.createdById)
    const recurrence = expenseRecurrenceUpdate(existing.recurringRule, body.recurringRule, existing.isRecurringTemplate)
    const household = await prisma.household.findUniqueOrThrow({ where: { id: householdId }, select: { currency: true } })
    if (body.currency && body.currency !== household.currency) throw new Error(`Expenses must use household currency ${household.currency}`)
    const amount = Number(body.amount ?? existing.amount)
    const method = body.allocationMethod ?? existing.allocationMethod
    const requested = body.allocations ?? existing.allocations.map((item) => ({ membershipId: item.membershipId, value: Number(item.value) }))
    const allocations = calculateExpenseAllocations(amount, method, requested)
    const memberIds = [body.paidByMembershipId ?? existing.paidByMembershipId, ...allocations.map((item) => item.membershipId)]
    if (await prisma.householdMembership.count({ where: { householdId, id: { in: memberIds }, removedAt: null } }) !== new Set(memberIds).size) throw new Error('Allocations must reference active members')
    const updated = await prisma.$transaction(async (tx) => {
      await tx.householdExpenseAllocation.deleteMany({ where: { expenseId } })
      const value = await tx.householdExpense.update({
        where: { id: expenseId },
        data: {
          description: body.description?.trim() ?? existing.description,
          amount, currency: household.currency,
          incurredAt: body.incurredAt ? new Date(body.incurredAt) : existing.incurredAt,
          ...recurrence,
          allocationMethod: method, paidByMembershipId: body.paidByMembershipId ?? existing.paidByMembershipId,
          notes: body.notes === undefined ? existing.notes : body.notes,
          allocations: { create: allocations },
        },
        include: { allocations: true },
      })
      await tx.householdAuditRecord.create({ data: { householdId, actorUserId: userId, action: 'expense_updated', resourceType: 'expense', resourceId: expenseId } })
      return value
    })
    return NextResponse.json(updated)
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid request' }, { status: error instanceof HouseholdAccessError ? error.status : 400 }) }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ householdId: string; expenseId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id as string
  const { householdId, expenseId } = await params
  try {
    await requireHouseholdCapability(userId, householdId, 'delete')
    const existing = await expenseFor(householdId, expenseId)
    await prisma.$transaction([
      prisma.householdExpense.delete({ where: { id: expenseId } }),
      prisma.householdAuditRecord.create({ data: { householdId, actorUserId: userId, action: 'expense_deleted', resourceType: 'expense', resourceId: expenseId, metadata: { creatorUserId: existing.createdById, description: existing.description, amount: existing.amount.toString() } } }),
    ])
    return NextResponse.json({ deleted: true })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid request' }, { status: error instanceof HouseholdAccessError ? error.status : 400 }) }
}