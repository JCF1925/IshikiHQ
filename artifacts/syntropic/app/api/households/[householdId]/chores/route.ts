export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { HouseholdAccessError, parseHouseholdRecurrence, requireHouseholdCapability } from '@/lib/household'

export async function GET(_request: Request, { params }: { params: Promise<{ householdId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { householdId } = await params
  try {
    await requireHouseholdCapability((session.user as any).id, householdId, 'read')
    return NextResponse.json(await prisma.householdChore.findMany({ where: { householdId }, include: { assignments: true, completions: { orderBy: { completedAt: 'desc' } } }, orderBy: { nextDueAt: 'asc' } }))
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
    if (!body.title?.trim()) throw new Error('Title is required')
    if (body.recurrenceRule) parseHouseholdRecurrence(body.recurrenceRule)
    const assignmentIds: string[] = body.assignmentMembershipIds ?? []
    const active = await prisma.householdMembership.count({ where: { householdId, id: { in: assignmentIds }, removedAt: null } })
    if (active !== new Set(assignmentIds).size) throw new Error('Assignments must reference active members')
    const chore = await prisma.$transaction(async (tx) => {
      const value = await tx.householdChore.create({ data: { householdId, createdById: userId, title: body.title.trim(), description: body.description ?? null, recurrenceRule: body.recurrenceRule ?? null, rotationEnabled: body.rotationEnabled ?? false, nextDueAt: body.nextDueAt ? new Date(body.nextDueAt) : null, assignments: { create: assignmentIds.map((membershipId, rotationOrder) => ({ membershipId, rotationOrder })) } }, include: { assignments: true } })
      await tx.householdAuditRecord.create({ data: { householdId, actorUserId: userId, action: 'chore_created', resourceType: 'chore', resourceId: value.id } })
      return value
    })
    return NextResponse.json(chore, { status: 201 })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid request' }, { status: error instanceof HouseholdAccessError ? error.status : 400 }) }
}