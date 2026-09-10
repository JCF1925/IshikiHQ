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

  const plan = await prisma.bnplPlan.findFirst({ where: { id, userId } })
  if (!plan) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Refund: remove unpaid future instalments, record a refund credit, mark plan refunded.
  if (body.action === 'refund') {
    const refundAmount = body.refundAmount !== undefined ? parseFloat(body.refundAmount) : null
    const paid = await prisma.transaction.findMany({ where: { userId, bnplPlanId: id, status: 'confirmed' } })
    const paidAmount = paid.reduce((s, t) => s + Math.abs(t.amount), 0)
    const credit = refundAmount ?? paidAmount
    // Remove unpaid scheduled instalments
    await prisma.transaction.deleteMany({ where: { userId, bnplPlanId: id, status: 'pending' } })
    if (credit > 0) {
      await prisma.transaction.create({
        data: {
          userId, date: new Date(), amount: credit, currency: 'AUD',
          merchant: plan.provider, description: `${plan.purchaseName} — refund`,
          category: plan.category, accountId: plan.accountId, bnplPlanId: id, status: 'confirmed',
        },
      })
    }
    await prisma.bnplPlan.update({ where: { id }, data: { status: 'refunded', refundedAmount: credit } })
    return NextResponse.json({ success: true })
  }

  const data: any = {}
  for (const f of ['provider', 'purchaseName', 'accountId', 'category', 'notes', 'status']) {
    if (body[f] !== undefined) data[f] = body[f] === '' ? null : body[f]
  }
  await prisma.bnplPlan.update({ where: { id }, data })
  return NextResponse.json({ success: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params

  // Remove unpaid scheduled instalments; keep confirmed history (detached).
  await prisma.transaction.deleteMany({ where: { userId, bnplPlanId: id, status: 'pending' } })
  await prisma.transaction.updateMany({ where: { userId, bnplPlanId: id, status: { in: ['pending', 'confirmed'] } }, data: { bnplPlanId: null } })
  await prisma.bnplPlan.deleteMany({ where: { id, userId } })
  return NextResponse.json({ success: true })
}
