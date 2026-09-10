export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { HouseholdAccessError, isHouseholdRole, lockHousehold, requireHouseholdCapability } from '@/lib/household'

async function ownerGuard(db: typeof prisma, householdId: string, membershipId: string, removingOwner = true) {
  const membership = await db.householdMembership.findFirst({ where: { id: membershipId, householdId, removedAt: null } })
  if (!membership) throw new HouseholdAccessError('Member not found', 404)
  if (removingOwner && membership.role === 'owner') {
    const owners = await db.householdMembership.count({ where: { householdId, role: 'owner', removedAt: null } })
    if (owners <= 1) throw new HouseholdAccessError('The last owner cannot be removed or demoted', 409)
  }
  return membership
}

export async function PATCH(request: Request, { params }: { params: Promise<{ householdId: string; membershipId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id as string
  const { householdId, membershipId } = await params
  try {
    await requireHouseholdCapability(userId, householdId, 'manage_members')
    const { role } = await request.json()
    if (!isHouseholdRole(role)) throw new HouseholdAccessError('Invalid role', 400)
    const updated = await prisma.$transaction(async (tx) => {
      // Transaction-scoped advisory lock serializes all owner transitions for
      // this household; a count-and-update cannot race another demotion.
      await lockHousehold(tx, householdId)
      const member = await ownerGuard(tx as any, householdId, membershipId, role !== 'owner')
      const value = await tx.householdMembership.update({ where: { id: membershipId }, data: { role } })
      await tx.householdAuditRecord.create({ data: { householdId, actorUserId: userId, action: 'member_role_changed', resourceType: 'membership', resourceId: membershipId, subjectUserId: member.userId, metadata: { from: member.role, to: role } } })
      return value
    })
    return NextResponse.json(updated)
  } catch (error) {
    const status = error instanceof HouseholdAccessError ? error.status : 400
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid request' }, { status })
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ householdId: string; membershipId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id as string
  const { householdId, membershipId } = await params
  try {
    const actor = await requireHouseholdCapability(userId, householdId, 'read')
    if (actor.membershipId !== membershipId) await requireHouseholdCapability(userId, householdId, 'manage_members')
    await prisma.$transaction(async (tx) => {
      await lockHousehold(tx, householdId)
      const member = await ownerGuard(tx as any, householdId, membershipId)
      // Soft removal preserves all historic creator/allocation/assignment relations,
      // while authorization checks removedAt and therefore revoke access immediately.
      await tx.householdMembership.update({ where: { id: membershipId }, data: { removedAt: new Date() } })
      await tx.householdAuditRecord.create({ data: { householdId, actorUserId: userId, action: 'member_removed', resourceType: 'membership', resourceId: membershipId, subjectUserId: member.userId } })
    }, { isolationLevel: 'Serializable' })
    return NextResponse.json({ removed: true })
  } catch (error) {
    const status = error instanceof HouseholdAccessError ? error.status : 400
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid request' }, { status })
  }
}