export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params
  const body = await request.json()
  const existing = await prisma.wfhPattern.findFirst({ where: { id, userId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const data: any = {}
  if (body.dayOfWeek !== undefined) data.dayOfWeek = Array.isArray(body.dayOfWeek) ? body.dayOfWeek.map((d: any) => parseInt(d, 10)) : []
  if (body.hours !== undefined) data.hours = parseFloat(body.hours) || 0
  if (body.startDate !== undefined) data.startDate = body.startDate ? new Date(body.startDate) : existing.startDate
  if (body.endDate !== undefined) data.endDate = body.endDate ? new Date(body.endDate) : null
  if (body.isActive !== undefined) data.isActive = body.isActive
  if (body.notes !== undefined) data.notes = body.notes || null
  const updated = await prisma.wfhPattern.update({ where: { id }, data })
  return NextResponse.json(updated)
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params
  const existing = await prisma.wfhPattern.findFirst({ where: { id, userId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await prisma.wfhPattern.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
