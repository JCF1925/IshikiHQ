export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { HouseholdAccessError, requireHouseholdCapability } from '@/lib/household'

export async function POST(request: Request, { params }: { params: Promise<{ householdId: string; petId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { householdId, petId } = await params
  try {
    await requireHouseholdCapability((session.user as any).id, householdId, 'create')
    const body = await request.json()
    if (!await prisma.householdPet.findFirst({ where: { id: petId, householdId } })) throw new Error('Pet not found')
    switch (body.type) {
      case 'schedule':
        if (!body.title?.trim() || !body.recurrenceRule) throw new Error('Title and recurrence rule are required')
        return NextResponse.json(await prisma.$transaction(async tx => { const value = await tx.householdPetCareSchedule.create({ data: { petId, createdById: (session.user as any).id, title: body.title.trim(), recurrenceRule: body.recurrenceRule, nextDueAt: body.nextDueAt ? new Date(body.nextDueAt) : null, notes: body.notes ?? null } }); await tx.householdAuditRecord.create({ data: { householdId, actorUserId: (session.user as any).id, action: 'pet_care_created', resourceType: 'pet_care_schedule', resourceId: value.id } }); return value }), { status: 201 })
      case 'appointment':
        if (!body.title?.trim() || !body.startsAt) throw new Error('Title and start are required')
        return NextResponse.json(await prisma.$transaction(async tx => { const value = await tx.householdPetAppointment.create({ data: { petId, createdById: (session.user as any).id, title: body.title.trim(), startsAt: new Date(body.startsAt), provider: body.provider ?? null, location: body.location ?? null, cost: body.cost ?? null, notes: body.notes ?? null } }); await tx.householdAuditRecord.create({ data: { householdId, actorUserId: (session.user as any).id, action: 'pet_care_created', resourceType: 'pet_appointment', resourceId: value.id } }); return value }), { status: 201 })
      case 'medication':
        if (!body.name?.trim()) throw new Error('Medication name is required')
        return NextResponse.json(await prisma.$transaction(async tx => { const value = await tx.householdPetMedication.create({ data: { petId, createdById: (session.user as any).id, name: body.name.trim(), instructions: body.instructions ?? null, quantity: body.quantity ?? 0, reorderThreshold: body.reorderThreshold ?? null, unit: body.unit ?? null, unitCost: body.unitCost ?? null } }); await tx.householdAuditRecord.create({ data: { householdId, actorUserId: (session.user as any).id, action: 'pet_care_created', resourceType: 'pet_medication', resourceId: value.id } }); return value }), { status: 201 })
      case 'cost':
        if (!body.description?.trim() || !(Number(body.amount) > 0)) throw new Error('Description and positive amount are required')
        return NextResponse.json(await prisma.$transaction(async tx => { const value = await tx.householdPetCost.create({ data: { petId, description: body.description.trim(), amount: body.amount, incurredAt: body.incurredAt ? new Date(body.incurredAt) : new Date(), createdById: (session.user as any).id } }); await tx.householdAuditRecord.create({ data: { householdId, actorUserId: (session.user as any).id, action: 'pet_care_created', resourceType: 'pet_cost', resourceId: value.id } }); return value }), { status: 201 })
      default: throw new Error('Type must be schedule, appointment, medication, or cost')
    }
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid request' }, { status: error instanceof HouseholdAccessError ? error.status : 400 }) }
}