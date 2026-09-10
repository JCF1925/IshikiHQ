export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { createStorageQrToken, HouseholdAccessError, requireHouseholdCapability, storageQrPath } from '@/lib/household'

export async function POST(_request: Request, { params }: { params: Promise<{ householdId: string; referenceId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id as string
  const { householdId, referenceId } = await params

  try {
    await requireHouseholdCapability(userId, householdId, 'create')
    const reference = await prisma.householdStorageQrReference.findFirst({
      where: { id: referenceId, householdId },
      select: {
        id: true,
        itemId: true,
        containerId: true,
        item: { select: { name: true } },
        container: { select: { name: true } },
      },
    })
    if (!reference) throw new HouseholdAccessError('Storage label not found', 404)

    const type = reference.item ? 'item' : 'container'
    const resourceId = reference.itemId ?? reference.containerId
    const displayText = reference.item?.name ?? reference.container?.name
    if (!resourceId || !displayText) throw new HouseholdAccessError('Storage label not found', 404)
    const { token, tokenHash } = createStorageQrToken()

    const created = await prisma.$transaction(async (tx) => {
      const replacement = await tx.householdStorageQrReference.create({
        data: {
          householdId,
          itemId: reference.itemId,
          containerId: reference.containerId,
          createdById: userId,
          tokenHash,
        },
        select: { id: true },
      })
      await tx.householdAuditRecord.create({
        data: {
          householdId,
          actorUserId: userId,
          action: 'storage_qr_generated',
          resourceType: 'storage_qr_reference',
          resourceId: replacement.id,
          metadata: { resourceType: type, resourceId, reprintOf: reference.id },
        },
      })
      return replacement
    })

    return NextResponse.json({
      label: {
        referenceId: created.id,
        type,
        resourceId,
        displayText,
        token,
        path: storageQrPath(token),
      },
    }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid request' },
      { status: error instanceof HouseholdAccessError ? error.status : 400 },
    )
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ householdId: string; referenceId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id as string
  const { householdId, referenceId } = await params

  try {
    await requireHouseholdCapability(userId, householdId, 'delete')
    const reference = await prisma.householdStorageQrReference.findFirst({
      where: { id: referenceId, householdId },
      select: { id: true, itemId: true, containerId: true },
    })
    if (!reference) throw new HouseholdAccessError('Storage label not found', 404)

    await prisma.$transaction(async (tx) => {
      await tx.householdStorageQrReference.delete({ where: { id: reference.id } })
      await tx.householdAuditRecord.create({
        data: {
          householdId,
          actorUserId: userId,
          action: 'storage_qr_revoked',
          resourceType: 'storage_qr_reference',
          resourceId: reference.id,
          metadata: {
            resourceType: reference.itemId ? 'item' : 'container',
            resourceId: reference.itemId ?? reference.containerId,
            count: 1,
          },
        },
      })
    })
    return NextResponse.json({ revoked: 1 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid request' },
      { status: error instanceof HouseholdAccessError ? error.status : 400 },
    )
  }
}