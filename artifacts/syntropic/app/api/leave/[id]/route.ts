export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params
  const existing = await prisma.leaveEntry.findFirst({ where: { id, userId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await prisma.leaveEntry.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
