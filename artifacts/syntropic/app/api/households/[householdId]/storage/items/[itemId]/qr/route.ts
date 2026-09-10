export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { createStorageQrToken, HouseholdAccessError, requireHouseholdCapability, storageQrPath } from '@/lib/household'

export async function POST(_request: Request, { params }: { params: Promise<{ householdId: string; itemId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id as string
  const { householdId, itemId } = await params
  try {
    await requireHouseholdCapability(userId, householdId, 'create')
    if (!await prisma.householdStorageItem.findFirst({ where: { id: itemId, householdId } })) throw new HouseholdAccessError('Storage item not found', 404)
    const { token, tokenHash } = createStorageQrToken()
    const reference = await prisma.$transaction(async tx => {
      const value = await tx.householdStorageQrReference.create({ data: { householdId, itemId, createdById: userId, tokenHash }, select: { id: true, itemId: true, createdAt: true } })
      await tx.householdAuditRecord.create({ data: { householdId, actorUserId: userId, action: 'storage_qr_generated', resourceType: 'storage_qr_reference', resourceId: value.id, metadata: { itemId } } })
      return value
    })
    const path = storageQrPath(token)
    return NextResponse.json({ ...reference, token, path }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid request' }, { status: error instanceof HouseholdAccessError ? error.status : 400 })
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ householdId: string; itemId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id as string
  const { householdId, itemId } = await params
  try {
    await requireHouseholdCapability(userId, householdId, 'delete')
    if (!await prisma.householdStorageItem.findFirst({ where: { id: itemId, householdId } })) throw new HouseholdAccessError('Storage item not found', 404)
    const revoked = await prisma.$transaction(async tx => {
      const result = await tx.householdStorageQrReference.deleteMany({ where: { householdId, itemId } })
      await tx.householdAuditRecord.create({ data: { householdId, actorUserId: userId, action: 'storage_qr_revoked', resourceType: 'storage_qr_reference', resourceId: itemId, metadata: { itemId, count: result.count } } })
      return result.count
    })
    return NextResponse.json({ revoked })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid request' }, { status: error instanceof HouseholdAccessError ? error.status : 400 })
  }
}