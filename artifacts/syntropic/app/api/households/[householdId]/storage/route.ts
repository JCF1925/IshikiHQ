export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { HouseholdAccessError, normalizeStorageLabelValues, requireHouseholdCapability } from '@/lib/household'

const fail = (error: unknown) => NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid request' }, { status: error instanceof HouseholdAccessError ? error.status : 400 })
const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null

export async function GET(request: Request, { params }: { params: Promise<{ householdId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { householdId } = await params
  try {
    await requireHouseholdCapability((session.user as any).id, householdId, 'read')
    const q = new URL(request.url).searchParams.get('q')?.trim()
    const contains = q ? { contains: q, mode: 'insensitive' as const } : undefined
    const [locations, containers, items] = await Promise.all([
      prisma.householdStorageLocation.findMany({ where: { householdId, ...(contains ? { OR: [{ name: contains }, { description: contains }] } : {}) }, include: { _count: { select: { containers: true, items: true } } }, orderBy: { name: 'asc' } }),
      prisma.householdStorageContainer.findMany({ where: { householdId, ...(contains ? { OR: [{ name: contains }, { description: contains }, { positionText: contains }] } : {}) }, include: { location: true, _count: { select: { items: true } } }, orderBy: { name: 'asc' } }),
      prisma.householdStorageItem.findMany({ where: { householdId, ...(contains ? { OR: [{ name: contains }, { description: contains }, { notes: contains }, { positionText: contains }, { labels: { some: { value: contains } } }] } : {}) }, include: { location: true, container: true, labels: { orderBy: { value: 'asc' } } }, orderBy: { name: 'asc' } }),
    ])
    return NextResponse.json({ locations, containers, items })
  } catch (error) { return fail(error) }
}

export async function POST(request: Request, { params }: { params: Promise<{ householdId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id as string
  const { householdId } = await params
  try {
    await requireHouseholdCapability(userId, householdId, 'create')
    const body = await request.json()
    const resourceType = String(body.resourceType ?? '')
    const result = await prisma.$transaction(async tx => {
      let value: any
      let action: any
      if (resourceType === 'location') {
        if (!text(body.name)) throw new Error('Location name is required')
        value = await tx.householdStorageLocation.create({ data: { householdId, createdById: userId, name: text(body.name)!, description: text(body.description) } }); action = 'storage_location_created'
      } else if (resourceType === 'container') {
        if (!text(body.name) || !body.locationId) throw new Error('Container name and locationId are required')
        if (!await tx.householdStorageLocation.findFirst({ where: { id: body.locationId, householdId } })) throw new Error('Location not found')
        value = await tx.householdStorageContainer.create({ data: { householdId, createdById: userId, locationId: body.locationId, name: text(body.name)!, description: text(body.description), positionText: text(body.positionText) }, include: { location: true } }); action = 'storage_container_created'
      } else if (resourceType === 'item') {
        if (!text(body.name) || !body.locationId) throw new Error('Item name and locationId are required')
        if (!await tx.householdStorageLocation.findFirst({ where: { id: body.locationId, householdId } })) throw new Error('Location not found')
        if (body.containerId && !await tx.householdStorageContainer.findFirst({ where: { id: body.containerId, householdId, locationId: body.locationId } })) throw new Error('Container must belong to the selected location')
        const labels = normalizeStorageLabelValues(body.labels ?? [])
        value = await tx.householdStorageItem.create({ data: { householdId, createdById: userId, locationId: body.locationId, containerId: body.containerId ?? null, name: text(body.name)!, description: text(body.description), quantity: body.quantity ?? 1, unit: text(body.unit), positionText: text(body.positionText), notes: text(body.notes), labels: { create: labels.map(label => ({ householdId, createdById: userId, value: label })) } }, include: { location: true, container: true, labels: true } }); action = 'storage_item_created'
      } else if (resourceType === 'label') {
        if (!text(body.value) || !body.itemId) throw new Error('Label value and itemId are required')
        if (!await tx.householdStorageItem.findFirst({ where: { id: body.itemId, householdId } })) throw new Error('Item not found')
        value = await tx.householdStorageLabel.create({ data: { householdId, itemId: body.itemId, createdById: userId, value: text(body.value)! } }); action = 'storage_label_created'
      } else throw new Error('resourceType must be location, container, item, or label')
      await tx.householdAuditRecord.create({ data: { householdId, actorUserId: userId, action, resourceType: `storage_${resourceType}`, resourceId: value.id } })
      return value
    })
    return NextResponse.json(result, { status: 201 })
  } catch (error) { return fail(error) }
}