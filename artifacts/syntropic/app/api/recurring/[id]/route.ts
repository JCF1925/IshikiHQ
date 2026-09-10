export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

function signed(kind: string, amount: number) {
  const mag = Math.abs(amount)
  return kind === 'income' ? mag : -mag
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params
  const body = await req.json()

  const existing = await prisma.recurringTransaction.findFirst({ where: { id, userId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const data: any = {}
  for (const f of ['name', 'kind', 'currency', 'merchant', 'category', 'subcategory', 'accountId', 'frequency', 'taxCategory', 'notes']) {
    if (body[f] !== undefined) data[f] = body[f] === '' ? null : body[f]
  }
  if (body.amount !== undefined) data.amount = Math.abs(parseFloat(body.amount))
  if (body.interval !== undefined) data.interval = parseInt(body.interval)
  if (body.isBill !== undefined) data.isBill = body.isBill
  if (body.isDeductible !== undefined) data.isDeductible = body.isDeductible
  if (body.isActive !== undefined) data.isActive = body.isActive
  if (body.endDate !== undefined) data.endDate = body.endDate ? new Date(body.endDate) : null

  await prisma.recurringTransaction.update({ where: { id }, data })

  // Effective-date edit: update forecast (unconfirmed) transactions on/after the effective date
  if (body.effectiveDate) {
    const eff = new Date(body.effectiveDate)
    const kind = data.kind ?? existing.kind
    const amount = data.amount ?? existing.amount
    await prisma.transaction.updateMany({
      where: { userId, recurringId: id, status: 'pending', date: { gte: eff } },
      data: {
        amount: signed(kind, amount),
        merchant: data.merchant ?? existing.merchant,
        category: data.category ?? existing.category,
        subcategory: data.subcategory ?? existing.subcategory,
        accountId: data.accountId ?? existing.accountId,
        isDeductible: data.isDeductible ?? existing.isDeductible,
        taxCategory: data.taxCategory ?? existing.taxCategory,
      },
    })
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params
  const url = new URL(req.url)
  const purge = url.searchParams.get('purgeForecast') !== 'false' // default: remove future forecasts

  const existing = await prisma.recurringTransaction.findFirst({ where: { id, userId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (purge) {
    // Remove only future, unconfirmed forecast txns; keep any already confirmed history.
    await prisma.transaction.deleteMany({
      where: { userId, recurringId: id, status: 'pending', date: { gte: new Date() } },
    })
  }
  // Detach remaining (confirmed) txns from the template
  await prisma.transaction.updateMany({ where: { userId, recurringId: id, status: { in: ['pending', 'confirmed'] } }, data: { recurringId: null } })
  await prisma.recurringTransaction.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
