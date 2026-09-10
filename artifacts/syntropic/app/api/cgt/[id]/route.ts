export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { fyOfDate } from '@/lib/tax'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params
  const body = await request.json()
  const existing = await prisma.capitalGainEvent.findFirst({ where: { id, userId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const data: any = {}
  if (body.assetName !== undefined) data.assetName = body.assetName
  if (body.assetType !== undefined) data.assetType = body.assetType
  if (body.quantity !== undefined) data.quantity = body.quantity ? parseFloat(body.quantity) : null
  if (body.acquireDate !== undefined) data.acquireDate = body.acquireDate ? new Date(body.acquireDate) : existing.acquireDate
  if (body.acquireCost !== undefined) data.acquireCost = Math.abs(parseFloat(body.acquireCost)) || 0
  if (body.disposalDate !== undefined) {
    data.disposalDate = body.disposalDate ? new Date(body.disposalDate) : null
    data.financialYear = body.disposalDate ? fyOfDate(new Date(body.disposalDate)) : null
  }
  if (body.disposalProceeds !== undefined) data.disposalProceeds = body.disposalProceeds === '' || body.disposalProceeds == null ? null : parseFloat(body.disposalProceeds)
  if (body.notes !== undefined) data.notes = body.notes || null

  const updated = await prisma.capitalGainEvent.update({ where: { id }, data })
  return NextResponse.json(updated)
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params
  const existing = await prisma.capitalGainEvent.findFirst({ where: { id, userId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await prisma.capitalGainEvent.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
