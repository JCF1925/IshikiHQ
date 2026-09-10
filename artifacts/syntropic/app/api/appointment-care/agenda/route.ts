export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { validateAppointmentCareOwnership } from '@/lib/appointment-care'
import { optionalDate } from '@/lib/appointment-care'
export async function GET() {
  const session = await auth(); if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await prisma.privateAgendaItem.findMany({ where: { userId: (session.user as any).id }, include: { practitioner: true, practice: true, symptom: true, appointment: true }, orderBy: { startsAt: 'asc' } }))
}
export async function POST(request: Request) {
  const session = await auth(); if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id; const b = await request.json()
  if (!b.title) return NextResponse.json({ error: 'title is required' }, { status: 400 })
  try { await validateAppointmentCareOwnership(userId, b) } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }) }
  let startsAt, endsAt
  try { startsAt = optionalDate(b.startsAt, 'startsAt'); endsAt = optionalDate(b.endsAt, 'endsAt') } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }) }
  const item = await prisma.privateAgendaItem.create({ data: { userId, title: b.title, details: b.details ?? null, startsAt, endsAt, practitionerId: b.practitionerId ?? null, practiceId: b.practiceId ?? null, symptomId: b.symptomId ?? null, appointmentId: b.appointmentId ?? null, status: b.status ?? 'open' } })
  return NextResponse.json(item, { status: 201 })
}
export async function patchAgenda(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id; const { id } = await params; const b = await request.json()
  const owned = await prisma.privateAgendaItem.findFirst({ where: { id, userId } }); if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  try { await validateAppointmentCareOwnership(userId, b) } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }) }
  let startsAt, endsAt
  try { startsAt = 'startsAt' in b ? optionalDate(b.startsAt, 'startsAt') : undefined; endsAt = 'endsAt' in b ? optionalDate(b.endsAt, 'endsAt') : undefined } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }) }
  const data: any = {}; for (const key of ['title', 'details', 'practitionerId', 'practiceId', 'symptomId', 'appointmentId', 'status']) if (key in b) data[key] = b[key] ?? null
  if (startsAt !== undefined) data.startsAt = startsAt; if (endsAt !== undefined) data.endsAt = endsAt
  return NextResponse.json(await prisma.privateAgendaItem.update({ where: { id }, data }))
}
