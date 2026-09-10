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

  await prisma.person.updateMany({
    where: { id, userId },
    data: {
      name: body.name?.trim(),
      type: body.type,
      role: body.role,
      referralRequired: body.referralRequired !== undefined ? Boolean(body.referralRequired) : undefined,
      isActive: body.isActive !== undefined ? Boolean(body.isActive) : undefined,
      phone: body.phone,
      email: body.email,
      address: body.address,
      organisationId: body.organisationId === '' ? null : body.organisationId,
      birthday: body.birthday !== undefined ? (body.birthday ? new Date(body.birthday) : null) : undefined,
      notes: body.notes,
    },
  })
  return NextResponse.json({ success: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params

  await prisma.event.deleteMany({ where: { userId, moduleRef: `person:${id}` } })
  await prisma.person.deleteMany({ where: { id, userId } })
  return NextResponse.json({ success: true })
}
