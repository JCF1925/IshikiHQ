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

  const existing = await prisma.budget.findFirst({ where: { id, userId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const data: any = {}
  if (body.name !== undefined) data.name = body.name
  if (body.period !== undefined) data.period = body.period
  if (body.category !== undefined) data.category = body.category || null
  if (body.allocatedAmount !== undefined) data.allocatedAmount = parseFloat(body.allocatedAmount)
  if (body.startDate !== undefined) data.startDate = new Date(body.startDate)
  if (body.endDate !== undefined) data.endDate = body.endDate ? new Date(body.endDate) : null
  if (body.isActive !== undefined) data.isActive = body.isActive

  const budget = await prisma.budget.update({ where: { id }, data })
  return NextResponse.json(budget)
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params

  const existing = await prisma.budget.findFirst({ where: { id, userId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.budget.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
