export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

function num(v: any, d = 0): number { const n = parseFloat(v); return isNaN(n) ? d : n }

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params
  const body = await request.json()

  const existing = await prisma.asset.findFirst({ where: { id, userId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const data: any = {}
  for (const k of ['name', 'assetType', 'unitCode', 'notes', 'linkedAccountId', 'linkedLiabilityId']) {
    if (body[k] !== undefined) data[k] = body[k] || null
  }
  for (const k of ['currentValue', 'growthRate', 'incomeRate', 'ongoingCostAnnual', 'upfrontCost']) {
    if (body[k] !== undefined) data[k] = num(body[k])
  }
  for (const k of ['purchaseValue', 'quantity']) {
    if (body[k] !== undefined) data[k] = body[k] === '' || body[k] == null ? null : num(body[k])
  }
  for (const k of ['purchaseDate', 'acquisitionDate']) {
    if (body[k] !== undefined) data[k] = body[k] ? new Date(body[k]) : null
  }
  if (body.isProvisional !== undefined) data.isProvisional = !!body.isProvisional
  if (body.isActive !== undefined) data.isActive = !!body.isActive

  const asset = await prisma.asset.update({ where: { id }, data })
  return NextResponse.json(asset)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params
  const existing = await prisma.asset.findFirst({ where: { id, userId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await prisma.asset.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
