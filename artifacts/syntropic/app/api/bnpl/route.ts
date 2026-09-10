export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { advance } from '@/lib/recurrence'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id

  const plans = await prisma.bnplPlan.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } })

  // Attach the plan's scheduled/paid instalment transactions for progress display
  const txns = await prisma.transaction.findMany({
    where: { userId, bnplPlanId: { in: plans.map((p) => p.id) } },
    orderBy: { date: 'asc' },
  })
  const byPlan: Record<string, any[]> = {}
  txns.forEach((t) => {
    if (!t.bnplPlanId) return
    ;(byPlan[t.bnplPlanId] ||= []).push(t)
  })
  const withInstalments = plans.map((p) => {
    const list = byPlan[p.id] ?? []
    const paid = list.filter((t) => t.status === 'confirmed')
    const paidAmount = paid.reduce((s, t) => s + Math.abs(t.amount), 0)
    return { ...p, instalments: list, paidCount: paid.length, paidAmount }
  })
  return NextResponse.json(withInstalments)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const body = await request.json()

  const totalAmount = parseFloat(body.totalAmount)
  const deposit = parseFloat(body.deposit ?? '0')
  const numInstalments = parseInt(body.numInstalments ?? '4')
  const frequency = body.frequency ?? 'fortnightly'
  const startDate = new Date(body.startDate)
  const financed = Math.max(0, totalAmount - deposit)
  const instalmentAmount = numInstalments > 0 ? financed / numInstalments : 0

  const plan = await prisma.bnplPlan.create({
    data: {
      userId,
      provider: body.provider ?? 'Other',
      purchaseName: body.purchaseName,
      accountId: body.accountId || null,
      totalAmount,
      deposit,
      numInstalments,
      frequency,
      startDate,
      instalmentAmount,
      category: body.category ?? null,
      notes: body.notes ?? null,
      status: 'active',
    },
  })

  // Schedule instalment transactions (as forecast liabilities). Deposit is paid at startDate.
  const rows: any[] = []
  if (deposit > 0) {
    rows.push({
      userId, date: startDate, amount: -deposit, currency: 'AUD',
      merchant: plan.provider, description: `${plan.purchaseName} — deposit`,
      category: plan.category, accountId: plan.accountId,
      bnplPlanId: plan.id, isForecast: true, status: 'pending',
    })
  }
  let d = new Date(startDate)
  for (let i = 0; i < numInstalments; i++) {
    d = advance(d, frequency, 1)
    rows.push({
      userId, date: new Date(d), amount: -instalmentAmount, currency: 'AUD',
      merchant: plan.provider, description: `${plan.purchaseName} — instalment ${i + 1}/${numInstalments}`,
      category: plan.category, accountId: plan.accountId,
      bnplPlanId: plan.id, isForecast: true, status: 'pending',
    })
  }
  if (rows.length > 0) await prisma.transaction.createMany({ data: rows })

  return NextResponse.json(plan, { status: 201 })
}
