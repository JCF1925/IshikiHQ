export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

const num = (v: any) => (v != null && v !== '' ? parseFloat(v) : null)

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params
  const b = await request.json()
  const owned = await prisma.phiPolicy.findFirst({ where: { id, userId } })
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // update a single limit's used amount
  if (b.action === 'setLimitUsed' && b.limitId) {
    await prisma.phiLimit.updateMany({ where: { id: b.limitId, userId }, data: { usedAmount: num(b.usedAmount) ?? 0 } })
    return NextResponse.json({ ok: true })
  }

  const data: any = {}
  for (const k of ['policyName', 'policyNumber', 'coverType', 'premiumFrequency', 'notes', 'insurerId']) if (k in b) data[k] = b[k] || null
  if ('premium' in b) data.premium = num(b.premium)
  if ('excess' in b) data.excess = num(b.excess)
  if ('isActive' in b) data.isActive = !!b.isActive
  if ('startDate' in b) data.startDate = b.startDate ? new Date(b.startDate) : null
  if ('endDate' in b) data.endDate = b.endDate ? new Date(b.endDate) : null
  const updated = await prisma.phiPolicy.update({ where: { id }, data })
  return NextResponse.json(updated)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params
  await prisma.phiPolicy.deleteMany({ where: { id, userId } })
  return NextResponse.json({ ok: true })
}
