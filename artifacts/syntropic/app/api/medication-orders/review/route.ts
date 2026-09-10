import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { fortnightStart } from '@/lib/pharmacy-refill'
import { getRefillForecasts } from '@/lib/pharmacy-refill-forecast'

// Called at the start of a fortnight by the task runner.  It is intentionally
// bounded and idempotent: only the next seven days are considered and the
// period key prevents duplicate open tasks.
export async function POST() {
  const session = await auth(); if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const period = fortnightStart(today)
  const periodKey = period.toISOString().slice(0, 10)
  const week = new Date(today.getTime() + 7 * 86400000)
  const forecasts = await getRefillForecasts(userId, today)
  const due = forecasts.filter(forecast => forecast.needsRefill && forecast.refillDate != null && forecast.refillDate <= week).slice(0, 200)
  const ref = `medication-refill-review:${periodKey}`
  const existing = await prisma.task.findFirst({ where: { userId, moduleRef: ref, status: { notIn: ['done', 'cancelled'] } } })
  if (existing || !due.length) return NextResponse.json({ created: 0, considered: due.length, periodStart: periodKey })
  await prisma.task.create({ data: { userId, title: 'Review medication refills', description: `Review ${due.length} medicine(s) due in the following week. Forecasts are manual-first and PRN-aware.`, status: 'todo', priority: 'medium', isImportant: true, dueDate: week, tags: ['health', 'medication', 'pharmacy'], moduleRef: ref } })
  return NextResponse.json({ created: 1, considered: due.length, periodStart: periodKey })
}