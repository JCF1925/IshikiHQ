export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { HouseholdAccessError, requireHouseholdCapability } from '@/lib/household'

export async function GET(_request: Request, { params }: { params: Promise<{ householdId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { householdId } = await params
  try {
    await requireHouseholdCapability((session.user as any).id, householdId, 'read')
    const pets = await prisma.householdPet.findMany({ where: { householdId }, include: { careSchedules: true, appointments: { orderBy: { startsAt: 'asc' } }, medications: true, costs: { orderBy: { incurredAt: 'desc' } } }, orderBy: { name: 'asc' } })
    return NextResponse.json(pets.map((pet) => ({ ...pet, costTotal: pet.costs.reduce((sum, cost) => sum + Number(cost.amount), 0) + pet.appointments.reduce((sum, appointment) => sum + Number(appointment.cost ?? 0), 0), medicationStockValue: pet.medications.reduce((sum, medication) => sum + Number(medication.quantity) * Number(medication.unitCost ?? 0), 0) })))
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid request' }, { status: error instanceof HouseholdAccessError ? error.status : 400 }) }
}

export async function POST(request: Request, { params }: { params: Promise<{ householdId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id as string
  const { householdId } = await params
  try {
    await requireHouseholdCapability(userId, householdId, 'create')
    const body = await request.json()
    if (!body.name?.trim() || !body.species?.trim()) throw new Error('Name and species are required')
    const pet = await prisma.$transaction(async (tx) => {
      const value = await tx.householdPet.create({ data: { householdId, createdById: userId, name: body.name.trim(), species: body.species.trim(), breed: body.breed ?? null, dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null, notes: body.notes ?? null } })
      await tx.householdAuditRecord.create({ data: { householdId, actorUserId: userId, action: 'pet_created', resourceType: 'pet', resourceId: value.id } })
      return value
    })
    return NextResponse.json(pet, { status: 201 })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid request' }, { status: error instanceof HouseholdAccessError ? error.status : 400 }) }
}