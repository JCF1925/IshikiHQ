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
  const existing = await prisma.hELPDebt.findFirst({ where: { id, userId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const data: any = {}
  if (body.originalAmount !== undefined) data.originalAmount = Math.abs(parseFloat(body.originalAmount)) || 0
  if (body.currentBalance !== undefined) data.currentBalance = Math.abs(parseFloat(body.currentBalance)) || 0
  if (body.indexationDate !== undefined) data.indexationDate = body.indexationDate ? new Date(body.indexationDate) : null
  if (body.repaymentThreshold !== undefined) data.repaymentThreshold = body.repaymentThreshold ? parseFloat(body.repaymentThreshold) : null
  if (body.annualRepayment !== undefined) data.annualRepayment = parseFloat(body.annualRepayment) || 0
  if (body.notes !== undefined) data.notes = body.notes || null

  const updated = await prisma.hELPDebt.update({ where: { id }, data })
  return NextResponse.json(updated)
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params
  const existing = await prisma.hELPDebt.findFirst({ where: { id, userId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await prisma.hELPDebt.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
