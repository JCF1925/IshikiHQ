export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { HouseholdAccessError, requireHouseholdCapability } from '@/lib/household'

export async function DELETE(_request: Request, { params }: { params: Promise<{ householdId: string; invitationId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id as string
  const { householdId, invitationId } = await params
  try {
    await requireHouseholdCapability(userId, householdId, 'invite')
    const result = await prisma.$transaction(async (tx) => {
      const changed = await tx.householdInvitation.updateMany({ where: { id: invitationId, householdId, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } })
      if (!changed.count) throw new HouseholdAccessError('Invitation not found or already consumed', 404)
      await tx.householdAuditRecord.create({ data: { householdId, actorUserId: userId, action: 'invitation_revoked', resourceType: 'invitation', resourceId: invitationId } })
      return changed
    })
    return NextResponse.json({ revoked: result.count === 1 })
  } catch (error) {
    const status = error instanceof HouseholdAccessError ? error.status : 400
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid request' }, { status })
  }
}