export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { validateAppointmentCareOwnership } from '@/lib/appointment-care'

export async function GET() {
  const session = await auth(); if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  return NextResponse.json(await prisma.appointmentOffering.findMany({
    where: { userId, isActive: true }, include: { practice: true, overrides: { where: { isActive: true }, include: { practitioner: true } } },
    orderBy: { name: 'asc' },
  }))
}

export async function POST(request: Request) {
  const session = await auth(); if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id; const b = await request.json()
  if (!b.name || !b.practiceId) return NextResponse.json({ error: 'name and practiceId are required' }, { status: 400 })
  try { await validateAppointmentCareOwnership(userId, { practiceId: b.practiceId, practitionerId: b.practitionerId }) }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }) }
  const offering = await prisma.appointmentOffering.create({ data: {
    userId, practiceId: b.practiceId, name: b.name, description: b.description ?? null, appointmentType: b.appointmentType ?? null,
    durationMinutes: b.durationMinutes == null ? null : Number(b.durationMinutes), medicareItem: b.medicareItem ?? null,
    defaultCost: b.defaultCost == null ? null : Number(b.defaultCost), defaultMedicareRebate: b.defaultMedicareRebate == null ? null : Number(b.defaultMedicareRebate),
    ...(b.practitionerId ? { overrides: { create: { userId, practitionerId: b.practitionerId, durationMinutes: b.durationMinutes == null ? null : Number(b.durationMinutes), medicareItem: b.medicareItem ?? null, cost: b.defaultCost == null ? null : Number(b.defaultCost), medicareRebate: b.defaultMedicareRebate == null ? null : Number(b.defaultMedicareRebate) } } } : {}),
  } })
  return NextResponse.json(offering, { status: 201 })
}
