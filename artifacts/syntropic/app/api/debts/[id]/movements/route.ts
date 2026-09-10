export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { createDebtMovement } from '@/lib/interpersonal-debt'
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  try { let type = body.type === 'advance' ? 'principal_advance' : body.type; if (body.householdExpenseId) type = 'household_expense_allocation'; if (body.householdSettlementId) type = 'household_settlement_allocation'; if (!['principal_advance', 'repayment', 'adjustment', 'household_expense_allocation', 'household_settlement_allocation'].includes(type)) throw new Error('Invalid movement type'); const movement = await createDebtMovement({ userId: (session.user as any).id, agreementId: (await params).id, type, amount: Number(body.amount), effectiveAt: new Date(body.effectiveAt ?? Date.now()), description: body.note, sourceTransactionId: body.transactionId, householdExpenseId: body.householdExpenseId, householdSettlementId: body.householdSettlementId, allocations: body.allocations }); return NextResponse.json(movement, { status: 201 }) } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Invalid request' }, { status: 400 }) }
}