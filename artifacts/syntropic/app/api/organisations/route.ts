export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id

  const organisations = await prisma.organisation.findMany({
    where: { userId },
    include: { _count: { select: { people: true } } },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(organisations)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const body = await request.json()

  if (!body.name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const organisation = await prisma.organisation.create({
    data: {
      userId,
      name: body.name.trim(),
      type: body.type ?? null,
      address: body.address ?? null,
      phone: body.phone ?? null,
      website: body.website ?? null,
      notes: body.notes ?? null,
      medicarePracticeIdentifier: body.medicarePracticeIdentifier ?? null,
    },
  })
  return NextResponse.json(organisation, { status: 201 })
}
