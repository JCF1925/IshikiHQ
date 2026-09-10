export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { createInvitationToken, HouseholdAccessError, isHouseholdRole, requireHouseholdCapability } from '@/lib/household'

export async function POST(request: Request, { params }: { params: Promise<{ householdId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id as string
  const { householdId } = await params
  try {
    await requireHouseholdCapability(userId, householdId, 'invite')
    const body = await request.json()
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (!email || !isHouseholdRole(body.role)) return NextResponse.json({ error: 'Valid email and role are required' }, { status: 400 })
    // Only owners may grant ownership.
    if (body.role === 'owner') await requireHouseholdCapability(userId, householdId, 'manage_members')
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : new Date(Date.now() + 7 * 86_400_000)
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date()) return NextResponse.json({ error: 'Expiry must be in the future' }, { status: 400 })
    const { token, tokenHash } = createInvitationToken()
    const invitation = await prisma.$transaction(async (tx) => {
      const created = await tx.householdInvitation.create({ data: { householdId, email, role: body.role, invitedById: userId, expiresAt, tokenHash } })
      await tx.householdAuditRecord.create({ data: { householdId, actorUserId: userId, action: 'invitation_created', resourceType: 'invitation', resourceId: created.id, metadata: { email, role: body.role, expiresAt: expiresAt.toISOString() } } })
      return created
    })
    // The raw token is returned once for the caller to deliver; it is never persisted.
    return NextResponse.json({ id: invitation.id, email, role: invitation.role, expiresAt, token }, { status: 201 })
  } catch (error) {
    const status = error instanceof HouseholdAccessError ? error.status : 400
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid request' }, { status })
  }
}