export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { createStorageQrToken, HouseholdAccessError, requireHouseholdCapability, storageQrPath } from '@/lib/household'

export async function POST(_request: Request, { params }: { params: Promise<{ householdId: string; containerId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id as string
  const { householdId, containerId } = await params
  try {
    await requireHouseholdCapability(userId, householdId, 'create')
    if (!await prisma.householdStorageContainer.findFirst({ where: { id: containerId, householdId } })) {
      throw new HouseholdAccessError('Storage container not found', 404)
    }
    const { token, tokenHash } = createStorageQrToken()
    const reference = await prisma.$transaction(async (tx) => {
      const value = await tx.householdStorageQrReference.create({
        data: { householdId, containerId, createdById: userId, tokenHash },
        select: { id: true, containerId: true, createdAt: true },
      })
      await tx.householdAuditRecord.create({
        data: { householdId, actorUserId: userId, action: 'storage_qr_generated', resourceType: 'storage_qr_reference', resourceId: value.id, metadata: { containerId } },
      })
      return value
    })
    return NextResponse.json({ ...reference, token, path: storageQrPath(token) }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid request' },
      { status: error instanceof HouseholdAccessError ? error.status : 400 },
    )
  }
}