export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params
  const body = await req.json()

  await prisma.organisation.updateMany({
    where: { id, userId },
    data: {
      name: body.name?.trim(),
      type: body.type,
      address: body.address,
      phone: body.phone,
      website: body.website,
      notes: body.notes,
      medicarePracticeIdentifier: body.medicarePracticeIdentifier,
    },
  })
  return NextResponse.json({ success: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params

  await prisma.person.updateMany({ where: { organisationId: id, userId }, data: { organisationId: null } })
  await prisma.organisation.deleteMany({ where: { id, userId } })
  return NextResponse.json({ success: true })
}
