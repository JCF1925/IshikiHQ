export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id as string
  const memberships = await prisma.householdMembership.findMany({
    where: { userId, removedAt: null },
    include: { household: true },
    orderBy: { joinedAt: 'asc' },
  })
  return NextResponse.json({
    contexts: [
      { kind: 'private', id: 'private', name: 'Private' },
      ...memberships.map(({ household, id, role }) => ({ kind: 'household', id: household.id, membershipId: id, name: household.name, role })),
    ],
  })
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id as string
  const body = await request.json()
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  const household = await prisma.$transaction(async (tx) => {
    const created = await tx.household.create({
      data: {
        name,
        currency: body.currency ?? 'AUD',
        createdById: userId,
        memberships: { create: { userId, role: 'owner' } },
      },
      include: { memberships: true },
    })
    await tx.householdAuditRecord.create({
      data: { householdId: created.id, actorUserId: userId, action: 'household_created', resourceType: 'household', resourceId: created.id },
    })
    return created
  })
  return NextResponse.json(household, { status: 201 })
}