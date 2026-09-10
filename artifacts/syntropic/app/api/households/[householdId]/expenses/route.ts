export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { calculateHouseholdBalances, createHouseholdExpense, HouseholdAccessError, parseHouseholdRecurrence, requireHouseholdCapability } from '@/lib/household'

const methods = new Set(['equal', 'percentage', 'fixed', 'shares'])

export async function GET(_request: Request, { params }: { params: Promise<{ householdId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { householdId } = await params
  try {
    await requireHouseholdCapability((session.user as any).id, householdId, 'read')
    const [expenses, settlements] = await Promise.all([
      // Templates are instructions only; only materialised occurrences affect
      // operational lists and balances.
      prisma.householdExpense.findMany({ where: { householdId, isRecurringTemplate: false }, include: { allocations: true }, orderBy: { incurredAt: 'desc' } }),
      prisma.householdSettlement.findMany({ where: { householdId }, orderBy: { settledAt: 'desc' } }),
    ])
    return NextResponse.json({ expenses, settlements, balances: calculateHouseholdBalances(expenses as any, settlements as any) })
  } catch (error) {
    const status = error instanceof HouseholdAccessError ? error.status : 400
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid request' }, { status })
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ householdId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id as string
  const { householdId } = await params
  try {
    const body = await request.json()
    if (!methods.has(body.allocationMethod)) throw new Error('Invalid allocation method')
    if (body.recurringRule) parseHouseholdRecurrence(body.recurringRule)
    if (body.linkedTransactionId) {
      const transaction = await prisma.transaction.findFirst({ where: { id: body.linkedTransactionId, userId } })
      if (!transaction) throw new Error('Linked transaction must belong to the creator')
    }
    const incurredAt = new Date(body.incurredAt ?? Date.now())
    if (!body.description?.trim() || !Number.isFinite(incurredAt.getTime())) throw new Error('Description and valid date are required')
    const expense = await createHouseholdExpense({ householdId, actorUserId: userId, paidByMembershipId: body.paidByMembershipId, description: body.description.trim(), amount: Number(body.amount), requestedCurrency: body.currency, incurredAt, recurringRule: body.recurringRule ?? null, allocationMethod: body.allocationMethod, allocations: body.allocations, linkedTransactionId: body.linkedTransactionId, notes: body.notes })
    return NextResponse.json(expense, { status: 201 })
  } catch (error) {
    const status = error instanceof HouseholdAccessError ? error.status : 400
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid request' }, { status })
  }
}