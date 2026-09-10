export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { assertImmutableCreator, HouseholdAccessError, requireHouseholdCapability } from '@/lib/household'

const fail = (error: unknown) => NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid request' }, { status: error instanceof HouseholdAccessError ? error.status : 400 })
const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null
async function find(type: string, id: string, householdId: string) {
  if (type === 'location') return prisma.householdStorageLocation.findFirst({ where: { id, householdId } })
  if (type === 'container') return prisma.householdStorageContainer.findFirst({ where: { id, householdId } })
  if (type === 'item') return prisma.householdStorageItem.findFirst({ where: { id, householdId } })
  if (type === 'label') return prisma.householdStorageLabel.findFirst({ where: { id, householdId } })
  throw new Error('Unknown storage resource type')
}

export async function PATCH(request: Request, { params }: { params: Promise<{ householdId: string; resourceType: string; resourceId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id as string
  const { householdId, resourceType, resourceId } = await params
  try {
    await requireHouseholdCapability(userId, householdId, 'update')
    const body = await request.json()
    const old: any = await find(resourceType, resourceId, householdId)
    if (!old) throw new HouseholdAccessError('Storage resource not found', 404)
    assertImmutableCreator(old.createdById, body.createdById)
    const result = await prisma.$transaction(async tx => {
      let value: any
      let action: any
      if (resourceType === 'location') {
        value = await tx.householdStorageLocation.update({ where: { id: resourceId }, data: { name: body.name === undefined ? old.name : text(body.name), description: body.description === undefined ? old.description : text(body.description) } }); action = 'storage_location_updated'
      } else if (resourceType === 'container') {
        const locationId = body.locationId ?? old.locationId
        if (!await tx.householdStorageLocation.findFirst({ where: { id: locationId, householdId } })) throw new Error('Location not found')
        if (body.locationId && await tx.householdStorageItem.count({ where: { containerId: resourceId, locationId: { not: locationId } } })) throw new Error('Move contained items before changing container location')
        value = await tx.householdStorageContainer.update({ where: { id: resourceId }, data: { locationId, name: body.name === undefined ? old.name : text(body.name), description: body.description === undefined ? old.description : text(body.description), positionText: body.positionText === undefined ? old.positionText : text(body.positionText) } }); action = 'storage_container_updated'
      } else if (resourceType === 'item') {
        const locationId = body.locationId ?? old.locationId
        const containerId = body.containerId === undefined ? old.containerId : body.containerId
        if (!await tx.householdStorageLocation.findFirst({ where: { id: locationId, householdId } })) throw new Error('Location not found')
        if (containerId && !await tx.householdStorageContainer.findFirst({ where: { id: containerId, householdId, locationId } })) throw new Error('Container must belong to the selected location')
        if (body.labels !== undefined && !Array.isArray(body.labels)) throw new Error('Labels must be an array')
        await tx.householdStorageItem.update({
          where: { id: resourceId },
          data: {
            locationId,
            containerId,
            name: body.name === undefined ? old.name : text(body.name),
            description: body.description === undefined ? old.description : text(body.description),
            quantity: body.quantity === undefined ? old.quantity : body.quantity,
            unit: body.unit === undefined ? old.unit : text(body.unit),
            positionText: body.positionText === undefined ? old.positionText : text(body.positionText),
            notes: body.notes === undefined ? old.notes : text(body.notes),
          },
        })
        let labelChanges: Prisma.InputJsonObject | undefined
        if (body.labels !== undefined) {
          const before = await tx.householdStorageLabel.findMany({
            where: { householdId, itemId: resourceId },
          })
          const byId = new Map(before.map((label) => [label.id, label]))
          const retainedIds = new Set<string>()
          const createdIds: string[] = []
          const seenValues = new Set<string>()
          for (const entry of body.labels) {
            const value = text(typeof entry === 'string' ? entry : entry?.value)
            if (!value || seenValues.has(value)) continue
            seenValues.add(value)
            const id = typeof entry === 'object' && entry?.id ? String(entry.id) : null
            if (id) {
              const current = byId.get(id)
              if (!current) throw new HouseholdAccessError('Label not found on this item', 400)
              assertImmutableCreator(current.createdById, entry.createdById)
              if (retainedIds.has(current.id)) throw new Error('Label IDs must be unique')
              retainedIds.add(current.id)
              await tx.householdStorageLabel.update({ where: { id: current.id }, data: { value } })
            } else {
              const created = await tx.householdStorageLabel.create({
                data: { householdId, itemId: resourceId, createdById: userId, value },
              })
              retainedIds.add(created.id)
              createdIds.push(created.id)
            }
          }
          const removed = before.filter((label) => !retainedIds.has(label.id))
          if (removed.length) {
            await tx.householdStorageLabel.deleteMany({
              where: { itemId: resourceId, id: { in: removed.map((label) => label.id) } },
            })
          }
          labelChanges = {
            createdIds,
            retainedIds: [...retainedIds].filter((id) => byId.has(id)),
            removed: removed.map(({ id, createdById, value }) => ({ id, createdById, value })),
          }
        }
        value = await tx.householdStorageItem.findUniqueOrThrow({
          where: { id: resourceId },
          include: { location: true, container: true, labels: { orderBy: { value: 'asc' } } },
        })
        action = 'storage_item_updated'
        await tx.householdAuditRecord.create({
          data: {
            householdId,
            actorUserId: userId,
            action,
            resourceType: 'storage_item',
            resourceId,
            metadata: labelChanges ? { labelChanges } : undefined,
          },
        })
      } else {
        value = await tx.householdStorageLabel.update({ where: { id: resourceId }, data: { value: body.value === undefined ? old.value : text(body.value) } }); action = 'storage_label_updated'
      }
      if (resourceType !== 'item') {
        await tx.householdAuditRecord.create({ data: { householdId, actorUserId: userId, action, resourceType: `storage_${resourceType}`, resourceId } })
      }
      return value
    })
    return NextResponse.json(result)
  } catch (error) { return fail(error) }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ householdId: string; resourceType: string; resourceId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id as string
  const { householdId, resourceType, resourceId } = await params
  try {
    await requireHouseholdCapability(userId, householdId, 'delete')
    const old: any = await find(resourceType, resourceId, householdId)
    if (!old) throw new HouseholdAccessError('Storage resource not found', 404)
    await prisma.$transaction(async tx => {
      if (resourceType === 'location') await tx.householdStorageLocation.delete({ where: { id: resourceId } })
      else if (resourceType === 'container') await tx.householdStorageContainer.delete({ where: { id: resourceId } })
      else if (resourceType === 'item') await tx.householdStorageItem.delete({ where: { id: resourceId } })
      else await tx.householdStorageLabel.delete({ where: { id: resourceId } })
      const action: any = `storage_${resourceType}_deleted`
      await tx.householdAuditRecord.create({ data: { householdId, actorUserId: userId, action, resourceType: `storage_${resourceType}`, resourceId, metadata: { creatorUserId: old.createdById, name: old.name ?? old.value } } })
    })
    return NextResponse.json({ deleted: true })
  } catch (error) { return fail(error) }
}