export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { validateAppointmentCareOwnership } from '@/lib/appointment-care'
import { jsonField, optionalDate } from '@/lib/appointment-care'
export async function GET() {
  const session = await auth(); if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await prisma.appointmentOutcome.findMany({ where: { userId: (session.user as any).id }, include: { appointment: true, supersedes: true }, orderBy: { recordedAt: 'desc' } }))
}
export async function POST(request: Request) {
  const session = await auth(); if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id; const b = await request.json()
  if (!b.appointmentId || !b.outcome) return NextResponse.json({ error: 'appointmentId and outcome are required' }, { status: 400 })
  try {
    await validateAppointmentCareOwnership(userId, b)
    if (b.supersedesId) {
      const previous = await prisma.appointmentOutcome.findFirst({ where: { id: b.supersedesId, userId }, select: { appointmentId: true } })
      if (!previous || previous.appointmentId !== b.appointmentId) throw new Error('A correction must supersede an outcome for the same appointment')
    }
    for (const field of ['discussedItems', 'payment', 'referrals', 'pathologyRequests', 'medicationChanges', 'futureTasks']) jsonField(b[field], field)
    optionalDate(b.recordedAt, 'recordedAt')
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }) }
  const record = await prisma.appointmentOutcome.create({ data: {
    userId, appointmentId: b.appointmentId, outcome: b.outcome, followUp: b.followUp ?? null,
    discussedItems: (jsonField(b.discussedItems, 'discussedItems') ?? undefined) as any, payment: (jsonField(b.payment, 'payment') ?? undefined) as any,
    referrals: (jsonField(b.referrals, 'referrals') ?? undefined) as any, pathologyRequests: (jsonField(b.pathologyRequests, 'pathologyRequests') ?? undefined) as any,
    medicationChanges: (jsonField(b.medicationChanges, 'medicationChanges') ?? undefined) as any, futureTasks: (jsonField(b.futureTasks, 'futureTasks') ?? undefined) as any,
    recordedAt: optionalDate(b.recordedAt, 'recordedAt') ?? undefined, supersedesId: b.supersedesId ?? null,
  } })
  return NextResponse.json(record, { status: 201 })
}
