export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { occurrencesBetween } from '@/lib/recurrence'

function signed(kind: string, amount: number) {
  const mag = Math.abs(amount)
  return kind === 'income' ? mag : -mag
}

// Rolling-month generation: ensure every active template has forecast
// transactions materialised up to `monthsAhead` months from today.
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const body = await request.json().catch(() => ({}))
  const monthsAhead = parseInt(body.monthsAhead ?? '3')

  const horizon = new Date()
  horizon.setUTCMonth(horizon.getUTCMonth() + monthsAhead)

  const templates = await prisma.recurringTransaction.findMany({ where: { userId, isActive: true } })
  let created = 0

  for (const t of templates) {
    // Only generate beyond what already exists
    const after = t.lastGeneratedDate ? new Date(t.lastGeneratedDate) : new Date(t.anchorDate.getTime() - 1)
    const dates = occurrencesBetween(t.anchorDate, t.frequency, t.interval, after, horizon, t.endDate)
    if (dates.length === 0) continue
    await prisma.transaction.createMany({
      data: dates.map((d) => ({
        userId,
        date: d,
        amount: signed(t.kind, t.amount),
        currency: t.currency,
        merchant: t.merchant,
        category: t.category,
        subcategory: t.subcategory,
        accountId: t.accountId,
        isDeductible: t.isDeductible,
        taxCategory: t.taxCategory,
        isRecurring: true,
        recurringId: t.id,
        isForecast: true,
        status: 'pending',
        notes: t.notes,
      })),
    })
    await prisma.recurringTransaction.update({
      where: { id: t.id },
      data: { lastGeneratedDate: dates[dates.length - 1] },
    })
    created += dates.length
  }

  return NextResponse.json({ success: true, created, horizon })
}
