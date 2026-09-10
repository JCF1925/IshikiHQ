export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { assertImmutableCreator, HouseholdAccessError, requireHouseholdCapability } from '@/lib/household'

const delegates: Record<string, { key: string; delegate: any }> = {
  schedule: { key: 'householdPetCareSchedule', delegate: prisma.householdPetCareSchedule },
  appointment: { key: 'householdPetAppointment', delegate: prisma.householdPetAppointment },
  medication: { key: 'householdPetMedication', delegate: prisma.householdPetMedication },
  cost: { key: 'householdPetCost', delegate: prisma.householdPetCost },
}

async function recordFor(petId: string, type: string, id: string) {
  const selected = delegates[type]
  if (!selected) throw new HouseholdAccessError('Unknown pet care record', 404)
  const record = await selected.delegate.findFirst({ where: { id, petId } })
  if (!record) throw new HouseholdAccessError('Pet care record not found', 404)
  return { ...selected, record }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ householdId: string; petId: string; careType: string; careId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id as string
  const { householdId, petId, careType, careId } = await params
  try {
    await requireHouseholdCapability(userId, householdId, 'update')
    if (!await prisma.householdPet.findFirst({ where: { id: petId, householdId } })) throw new HouseholdAccessError('Pet not found', 404)
    const { key, record } = await recordFor(petId, careType, careId)
    const body = await request.json()
    assertImmutableCreator(record.createdById, body.createdById)
    const text = (key: string) => body[key] === undefined ? undefined : (typeof body[key] === 'string' ? body[key].trim() : (() => { throw new Error(`Invalid ${key}`) })())
    const date = (key: string) => {
      if (body[key] === undefined) return undefined
      if (body[key] === null) return null
      const value = new Date(body[key]); if (!Number.isFinite(value.getTime())) throw new Error(`Invalid ${key}`); return value
    }
    const number = (key: string) => {
      if (body[key] === undefined) return undefined
      if (body[key] === null) return null
      const value = Number(body[key]); if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid ${key}`); return value
    }
    const data = careType === 'schedule'
      ? { title: text('title'), recurrenceRule: text('recurrenceRule'), nextDueAt: date('nextDueAt'), notes: text('notes') }
      : careType === 'appointment'
        ? { title: text('title'), startsAt: date('startsAt'), provider: text('provider'), location: text('location'), cost: number('cost'), notes: text('notes') }
        : careType === 'medication'
          ? { name: text('name'), instructions: text('instructions'), quantity: number('quantity'), reorderThreshold: number('reorderThreshold'), unit: text('unit'), unitCost: number('unitCost') }
          : { description: text('description'), amount: number('amount'), incurredAt: date('incurredAt') }
    Object.keys(data).forEach((key) => (data as any)[key] === undefined && delete (data as any)[key])
    const updated = await prisma.$transaction(async tx => {
      const value = await (tx as any)[key].update({ where: { id: careId }, data })
      await tx.householdAuditRecord.create({ data: { householdId, actorUserId: userId, action: 'pet_care_updated', resourceType: `pet_${careType}`, resourceId: careId } })
      return value
    })
    return NextResponse.json(updated)
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid request' }, { status: error instanceof HouseholdAccessError ? error.status : 400 }) }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ householdId: string; petId: string; careType: string; careId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id as string
  const { householdId, petId, careType, careId } = await params
  try {
    await requireHouseholdCapability(userId, householdId, 'delete')
    if (!await prisma.householdPet.findFirst({ where: { id: petId, householdId } })) throw new HouseholdAccessError('Pet not found', 404)
    const { key, record } = await recordFor(petId, careType, careId)
    await prisma.$transaction(async tx => {
      await (tx as any)[key].delete({ where: { id: careId } })
      await tx.householdAuditRecord.create({ data: { householdId, actorUserId: userId, action: 'pet_care_deleted', resourceType: `pet_${careType}`, resourceId: careId, metadata: { creatorUserId: record.createdById, snapshot: record } } })
    })
    return NextResponse.json({ deleted: true })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid request' }, { status: error instanceof HouseholdAccessError ? error.status : 400 }) }
}