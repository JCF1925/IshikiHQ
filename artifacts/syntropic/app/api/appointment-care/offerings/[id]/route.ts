export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { finiteNumber, validateAppointmentCareOwnership } from '@/lib/appointment-care'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id; const { id } = await params; const b = await request.json()
  const offering = await prisma.appointmentOffering.findFirst({ where: { id, userId } })
  if (!offering) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  try {
    await validateAppointmentCareOwnership(userId, { practiceId: b.practiceId, practitionerId: b.practitionerId })
    if (b.practitionerId) {
      const practitioner = await prisma.person.findFirst({ where: { id: b.practitionerId, userId }, select: { organisationId: true } })
      if (!practitioner || practitioner.organisationId !== (b.practiceId ?? offering.practiceId)) throw new Error('Practitioner does not belong to this practice')
    }
    const fields: any = {}
    for (const key of ['name', 'description', 'appointmentType', 'medicareItem', 'isActive']) if (key in b) fields[key] = b[key]
    for (const [key, target] of [['durationMinutes', 'durationMinutes'], ['defaultCost', 'defaultCost'], ['defaultMedicareRebate', 'defaultMedicareRebate']] as const) if (key in b) fields[target] = finiteNumber(b[key], key)
    if (b.practiceId) fields.practiceId = b.practiceId
    if (b.practitionerId) {
      const override = { userId, practitionerId: b.practitionerId, durationMinutes: finiteNumber(b.durationMinutes, 'durationMinutes'), medicareItem: b.medicareItem ?? null, cost: finiteNumber(b.cost, 'cost'), medicareRebate: finiteNumber(b.medicareRebate, 'medicareRebate'), isActive: b.isActive ?? true }
      const result = await prisma.appointmentOffering.update({ where: { id }, data: fields })
      await prisma.appointmentOfferingOverride.upsert({ where: { offeringId_practitionerId: { offeringId: id, practitionerId: b.practitionerId } }, create: { offeringId: id, ...override }, update: override })
      return NextResponse.json(result)
    }
    return NextResponse.json(await prisma.appointmentOffering.update({ where: { id }, data: fields }))
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }) }
}