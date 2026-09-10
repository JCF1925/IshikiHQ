export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { assertImmutableCreator, HouseholdAccessError, requireHouseholdCapability } from '@/lib/household'

export async function PATCH(request: Request, { params }: { params: Promise<{ householdId: string; petId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id as string
  const { householdId, petId } = await params
  try {
    await requireHouseholdCapability(userId, householdId, 'update')
    const body = await request.json()
    const existing = await prisma.householdPet.findFirst({ where: { id: petId, householdId } })
    if (!existing) throw new HouseholdAccessError('Pet not found', 404)
    assertImmutableCreator(existing.createdById, body.createdById)
    const dateOfBirth = body.dateOfBirth === undefined ? existing.dateOfBirth : (body.dateOfBirth ? new Date(body.dateOfBirth) : null)
    if (dateOfBirth && !Number.isFinite(dateOfBirth.getTime())) throw new Error('Invalid date of birth')
    const pet = await prisma.$transaction(async tx => {
      const value = await tx.householdPet.update({ where: { id: petId }, data: { name: body.name?.trim() ?? existing.name, species: body.species?.trim() ?? existing.species, breed: body.breed === undefined ? existing.breed : body.breed, dateOfBirth, notes: body.notes === undefined ? existing.notes : body.notes } })
      await tx.householdAuditRecord.create({ data: { householdId, actorUserId: userId, action: 'pet_updated', resourceType: 'pet', resourceId: petId } })
      return value
    })
    return NextResponse.json(pet)
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid request' }, { status: error instanceof HouseholdAccessError ? error.status : 400 }) }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ householdId: string; petId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id as string
  const { householdId, petId } = await params
  try {
    await requireHouseholdCapability(userId, householdId, 'delete')
    const existing = await prisma.householdPet.findFirst({ where: { id: petId, householdId } })
    if (!existing) throw new HouseholdAccessError('Pet not found', 404)
    await prisma.$transaction(async tx => {
      await tx.householdPet.delete({ where: { id: petId } })
      await tx.householdAuditRecord.create({ data: { householdId, actorUserId: userId, action: 'pet_deleted', resourceType: 'pet', resourceId: petId, metadata: { creatorUserId: existing.createdById, name: existing.name } } })
    })
    return NextResponse.json({ deleted: true })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid request' }, { status: error instanceof HouseholdAccessError ? error.status : 400 }) }
}