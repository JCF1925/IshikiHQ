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

  await prisma.category.updateMany({
    where: { id, userId },
    data: {
      name: body.name?.trim(),
      taxCategory: body.taxCategory,
      sortOrder: body.sortOrder,
      isActive: body.isActive,
    },
  })
  return NextResponse.json({ success: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params

  // Cascade deletes children via schema relation
  await prisma.category.deleteMany({ where: { id, userId } })
  return NextResponse.json({ success: true })
}
