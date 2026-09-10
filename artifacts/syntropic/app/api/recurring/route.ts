export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { occurrencesBetween } from '@/lib/recurrence'

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const url = new URL(request.url)
  const bills = url.searchParams.get('bills')

  const where: any = { userId }
  if (bills === 'true') where.isBill = true

  const items = await prisma.recurringTransaction.findMany({
    where,
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  })
  return NextResponse.json(items)
}

function signed(kind: string, amount: number) {
  const mag = Math.abs(amount)
  return kind === 'income' ? mag : -mag
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const body = await request.json()

  const anchorDate = new Date(body.anchorDate)
  const rec = await prisma.recurringTransaction.create({
    data: {
      userId,
      name: body.name,
      kind: body.kind ?? 'expense',
      amount: Math.abs(parseFloat(body.amount)),
      currency: body.currency ?? 'AUD',
      merchant: body.merchant ?? null,
      category: body.category ?? null,
      subcategory: body.subcategory ?? null,
      accountId: body.accountId || null,
      frequency: body.frequency ?? 'monthly',
      interval: parseInt(body.interval ?? '1'),
      anchorDate,
      endDate: body.endDate ? new Date(body.endDate) : null,
      isBill: body.isBill ?? false,
      isDeductible: body.isDeductible ?? false,
      taxCategory: body.taxCategory ?? null,
      isActive: body.isActive ?? true,
      notes: body.notes ?? null,
    },
  })

  // Materialise forecast transactions from anchor up to the horizon.
  const monthsAhead = parseInt(body.monthsAhead ?? '3')
  const horizon = new Date()
  horizon.setUTCMonth(horizon.getUTCMonth() + monthsAhead)
  const after = new Date(anchorDate.getTime() - 1) // include the anchor itself
  const dates = occurrencesBetween(anchorDate, rec.frequency, rec.interval, after, horizon, rec.endDate)

  if (dates.length > 0) {
    await prisma.transaction.createMany({
      data: dates.map((d) => ({
        userId,
        date: d,
        amount: signed(rec.kind, rec.amount),
        currency: rec.currency,
        merchant: rec.merchant,
        category: rec.category,
        subcategory: rec.subcategory,
        accountId: rec.accountId,
        isDeductible: rec.isDeductible,
        taxCategory: rec.taxCategory,
        isRecurring: true,
        recurringId: rec.id,
        isForecast: true,
        status: 'pending',
        notes: rec.notes,
      })),
    })
    await prisma.recurringTransaction.update({
      where: { id: rec.id },
      data: { lastGeneratedDate: dates[dates.length - 1] },
    })
  }

  return NextResponse.json(rec, { status: 201 })
}
