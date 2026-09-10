export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { completeAndAdvanceHouseholdChore, HouseholdAccessError, requireHouseholdCapability } from '@/lib/household'

export async function POST(request: Request, { params }: { params: Promise<{ householdId: string; choreId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id as string
  const { householdId, choreId } = await params
  try {
    const context = await requireHouseholdCapability(userId, householdId, 'create')
    const body = await request.json()
    const membershipId = body.membershipId ?? context.membershipId
    const result = await completeAndAdvanceHouseholdChore({ householdId, choreId, membershipId, actorUserId: userId, occurrenceKey: body.occurrenceKey ?? (body.completedAt ? new Date(body.completedAt).toISOString() : new Date().toISOString()), completedAt: body.completedAt ? new Date(body.completedAt) : undefined, note: body.note ?? null })
    return NextResponse.json(result.completion, { status: result.idempotent ? 200 : 201 })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid request' }, { status: error instanceof HouseholdAccessError ? error.status : 400 }) }
}