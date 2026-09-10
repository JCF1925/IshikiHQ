export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { HouseholdAccessError, materialiseHouseholdRecurringExpenses, requireHouseholdCapability } from '@/lib/household'

export async function POST(request: Request, { params }: { params: Promise<{ householdId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { householdId } = await params
  try {
    await requireHouseholdCapability((session.user as any).id, householdId, 'create')
    const body = await request.json().catch(() => ({}))
    const through = body.through ? new Date(body.through) : new Date()
    if (!Number.isFinite(through.getTime())) throw new Error('Invalid materialisation date')
    const expenseIds = await materialiseHouseholdRecurringExpenses(householdId, through)
    return NextResponse.json({ created: expenseIds.length, expenseIds })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid request' }, { status: error instanceof HouseholdAccessError ? error.status : 400 })
  }
}