export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id

  const people = await prisma.person.findMany({
    where: { userId },
    include: { organisation: true },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(people)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const body = await request.json()

  if (!body.name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  const birthday = body.birthday ? new Date(body.birthday) : null

  const person = await prisma.person.create({
    data: {
      userId,
      name: body.name.trim(),
      type: body.type ?? 'person',
      role: body.role ?? null,
      referralRequired: body.type === 'practitioner' ? Boolean(body.referralRequired) : false,
      isActive: body.isActive !== false,
      phone: body.phone ?? null,
      email: body.email ?? null,
      address: body.address ?? null,
      organisationId: body.organisationId ?? null,
      birthday,
      notes: body.notes ?? null,
    },
  })

  // Auto-add birthday to the master events list (annual, tagged)
  if (birthday) {
    await prisma.event.create({
      data: {
        userId,
        title: `${person.name}'s Birthday`,
        type: 'personal',
        startDatetime: birthday,
        allDay: true,
        recurrenceRule: 'FREQ=YEARLY',
        peopleRefs: [person.id],
        moduleRef: `person:${person.id}`,
        tags: ['birthday'],
      },
    })
  }

  return NextResponse.json(person, { status: 201 })
}
