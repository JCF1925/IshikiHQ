export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { createStorageQrToken, HouseholdAccessError, requireHouseholdCapability, storageQrPath } from '@/lib/household'

type Selection = { type: 'item' | 'container'; id: string; displayText: string }

const fail = (error: unknown) => NextResponse.json(
  { error: error instanceof Error ? error.message : 'Invalid request' },
  { status: error instanceof HouseholdAccessError ? error.status : 400 },
)

function parseSelections(value: unknown): Selection[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) {
    throw new Error('Select between 1 and 100 storage records')
  }
  const seen = new Set<string>()
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid label selection')
    const candidate = entry as Record<string, unknown>
    const type = candidate.type
    const id = typeof candidate.id === 'string' ? candidate.id : ''
    const displayText = typeof candidate.displayText === 'string' ? candidate.displayText.trim() : ''
    if ((type !== 'item' && type !== 'container') || !id || !displayText || displayText.length > 80) {
      throw new Error('Every label needs a valid record and 1–80 characters of display text')
    }
    const key = `${type}:${id}`
    if (seen.has(key)) throw new Error('Each storage record can only be selected once')
    seen.add(key)
    return { type, id, displayText }
  })
}

export async function POST(request: Request, { params }: { params: Promise<{ householdId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id as string
  const { householdId } = await params

  try {
    await requireHouseholdCapability(userId, householdId, 'create')
    const selections = parseSelections((await request.json()).selections)
    const itemIds = selections.filter(({ type }) => type === 'item').map(({ id }) => id)
    const containerIds = selections.filter(({ type }) => type === 'container').map(({ id }) => id)
    const [items, containers] = await Promise.all([
      prisma.householdStorageItem.findMany({ where: { householdId, id: { in: itemIds } }, select: { id: true } }),
      prisma.householdStorageContainer.findMany({ where: { householdId, id: { in: containerIds } }, select: { id: true } }),
    ])
    const authorized = new Set([
      ...items.map(({ id }) => `item:${id}`),
      ...containers.map(({ id }) => `container:${id}`),
    ])
    const invalid = selections.filter(({ type, id }) => !authorized.has(`${type}:${id}`))
    if (invalid.length) {
      return NextResponse.json({
        error: 'Some selected storage records are missing or unavailable',
        invalid: invalid.map(({ type, id }) => ({ type, id })),
      }, { status: 409 })
    }

    const generated = selections.map((selection) => ({ selection, ...createStorageQrToken() }))
    const references = await prisma.$transaction(async (tx) => {
      const created = []
      for (const entry of generated) {
        const reference = await tx.householdStorageQrReference.create({
          data: {
            householdId,
            itemId: entry.selection.type === 'item' ? entry.selection.id : null,
            containerId: entry.selection.type === 'container' ? entry.selection.id : null,
            createdById: userId,
            tokenHash: entry.tokenHash,
          },
          select: { id: true },
        })
        await tx.householdAuditRecord.create({
          data: {
            householdId,
            actorUserId: userId,
            action: 'storage_qr_generated',
            resourceType: 'storage_qr_reference',
            resourceId: reference.id,
            metadata: { resourceType: entry.selection.type, resourceId: entry.selection.id },
          },
        })
        created.push({
          referenceId: reference.id,
          type: entry.selection.type,
          resourceId: entry.selection.id,
          displayText: entry.selection.displayText,
          token: entry.token,
          path: storageQrPath(entry.token),
        })
      }
      return created
    })
    return NextResponse.json({ labels: references }, { status: 201 })
  } catch (error) {
    return fail(error)
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ householdId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id as string
  const { householdId } = await params

  try {
    await requireHouseholdCapability(userId, householdId, 'read')
    const references = await prisma.householdStorageQrReference.findMany({
      where: { householdId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        itemId: true,
        containerId: true,
        createdAt: true,
        item: { select: { name: true } },
        container: { select: { name: true } },
      },
    })

    return NextResponse.json({
      labels: references
        .filter((reference) => reference.item || reference.container)
        .map((reference) => ({
          referenceId: reference.id,
          type: reference.item ? 'item' : 'container',
          resourceId: reference.itemId ?? reference.containerId,
          resourceName: reference.item?.name ?? reference.container?.name,
          createdAt: reference.createdAt,
        })),
    })
  } catch (error) {
    return fail(error)
  }
}