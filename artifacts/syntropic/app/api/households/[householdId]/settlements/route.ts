export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { createHouseholdSettlement, HouseholdAccessError } from '@/lib/household'

export async function POST(request: Request, { params }: { params: Promise<{ householdId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id as string
  const { householdId } = await params
  try {
    const body = await request.json()
    const amount = Number(body.amount)
    if (!Number.isFinite(amount) || amount <= 0 || body.payerMembershipId === body.payeeMembershipId) throw new Error('A positive settlement between two different members is required')
    const settledAt = new Date(body.settledAt ?? Date.now())
    const settlement = await createHouseholdSettlement({ householdId, actorUserId: userId, payerMembershipId: body.payerMembershipId, payeeMembershipId: body.payeeMembershipId, amount, requestedCurrency: body.currency, settledAt, note: body.note })
    return NextResponse.json(settlement, { status: 201 })
  } catch (error) {
    const status = error instanceof HouseholdAccessError ? error.status : 400
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid request' }, { status })
  }
}