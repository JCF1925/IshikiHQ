export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { changeHouseholdCurrency, HouseholdAccessError, requireHouseholdCapability } from '@/lib/household'

const fail = (error: unknown) => error instanceof HouseholdAccessError
  ? NextResponse.json({ error: error.message }, { status: error.status })
  : NextResponse.json({ error: 'Invalid request' }, { status: 400 })

export async function GET(_request: Request, { params }: { params: Promise<{ householdId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { householdId } = await params
  try {
    await requireHouseholdCapability((session.user as any).id, householdId, 'read')
    const household = await prisma.household.findUnique({
      where: { id: householdId },
      include: {
        memberships: { where: { removedAt: null }, select: { id: true, userId: true, role: true, joinedAt: true, user: { select: { name: true, email: true, image: true } } } },
      },
    })
    return NextResponse.json(household)
  } catch (error) { return fail(error) }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ householdId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id as string
  const { householdId } = await params
  try {
    await requireHouseholdCapability(userId, householdId, 'manage_household')
    const body = await request.json()
    const data: { name?: string; currency?: string } = {}
    if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim()
    if (typeof body.currency === 'string' && body.currency.trim()) data.currency = body.currency.trim()
    if (data.currency) await changeHouseholdCurrency({ householdId, actorUserId: userId, currency: data.currency })
    delete data.currency
    const updated = await prisma.$transaction(async (tx) => {
      const value = await tx.household.update({ where: { id: householdId }, data })
      await tx.householdAuditRecord.create({ data: { householdId, actorUserId: userId, action: 'household_updated', resourceType: 'household', resourceId: householdId, metadata: data } })
      return value
    })
    return NextResponse.json(updated)
  } catch (error) { return fail(error) }
}