export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

// Compute the current period window (containing `now`) anchored on the budget start date.
function currentWindow(start: Date, period: string, now: Date, end?: Date | null): { from: Date; to: Date } {
  const s = new Date(start)
  if (period === 'weekly' || period === 'fortnightly') {
    const stepDays = period === 'weekly' ? 7 : 14
    const stepMs = stepDays * 86400000
    const diff = now.getTime() - s.getTime()
    const periods = diff >= 0 ? Math.floor(diff / stepMs) : 0
    const from = new Date(s.getTime() + periods * stepMs)
    const to = new Date(from.getTime() + stepMs - 1)
    return { from, to }
  }
  if (period === 'oneoff') {
    // Single fixed window spanning the whole budget: start to end (or +1 year if open-ended)
    const to = end ? new Date(end) : new Date(Date.UTC(s.getUTCFullYear() + 1, s.getUTCMonth(), s.getUTCDate(), 23, 59, 59))
    return { from: s, to }
  }
  if (period === 'annually') {
    // 12-month window anchored on the start date's month/day, containing `now`
    let fromYear = now.getUTCFullYear()
    const anchor = new Date(Date.UTC(fromYear, s.getUTCMonth(), s.getUTCDate(), 0, 0, 0))
    if (now < anchor) fromYear -= 1
    const from = new Date(Date.UTC(fromYear, s.getUTCMonth(), s.getUTCDate(), 0, 0, 0))
    const to = new Date(Date.UTC(fromYear + 1, s.getUTCMonth(), s.getUTCDate(), 0, 0, 0) - 1)
    return { from, to }
  }
  // monthly (default): calendar-month window aligned to now
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0))
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59))
  return { from, to }
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id

  const budgets = await prisma.budget.findMany({
    where: { userId },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  })

  const now = new Date()
  const enriched = await Promise.all(
    budgets.map(async (b) => {
      const { from, to } = currentWindow(b.startDate, b.period, now, b.endDate)
      const catFilter = b.category ? { category: b.category } : {}
      // Actual spend: expenses (negative amounts) already occurred & confirmed within the window
      const actualAgg = await prisma.transaction.aggregate({
        where: {
          userId,
          ...catFilter,
          isTransfer: false,
          isForecast: false,
          amount: { lt: 0 },
          date: { gte: from, lte: to },
        },
        _sum: { amount: true },
      })
      // Committed: forecast/recurring expenses scheduled within the window
      const committedAgg = await prisma.transaction.aggregate({
        where: {
          userId,
          ...catFilter,
          isTransfer: false,
          isForecast: true,
          amount: { lt: 0 },
          date: { gte: from, lte: to },
        },
        _sum: { amount: true },
      })
      const actual = Math.abs(actualAgg._sum.amount ?? 0)
      const committed = Math.abs(committedAgg._sum.amount ?? 0)
      const remaining = b.allocatedAmount - actual - committed
      return {
        ...b,
        windowFrom: from,
        windowTo: to,
        actual,
        committed,
        remaining,
        pctUsed: b.allocatedAmount > 0 ? Math.round(((actual + committed) / b.allocatedAmount) * 100) : 0,
      }
    })
  )

  return NextResponse.json({ budgets: enriched })
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const body = await request.json()

  const budget = await prisma.budget.create({
    data: {
      userId,
      name: body.name,
      period: body.period ?? 'monthly',
      category: body.category ?? null,
      allocatedAmount: parseFloat(body.allocatedAmount ?? '0'),
      startDate: body.startDate ? new Date(body.startDate) : new Date(),
      endDate: body.endDate ? new Date(body.endDate) : null,
      isActive: body.isActive ?? true,
    },
  })

  return NextResponse.json(budget, { status: 201 })
}
