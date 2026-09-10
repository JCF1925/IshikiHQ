// Legacy endpoint retained for existing clients. It now records one reviewable
// period instead of creating duplicate ledger rows.
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params
  const source = await prisma.incomeSource.findFirst({ where: { id, userId } })
  if (!source) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = await request.json().catch(() => ({}))
  const payDate = body.payDate ? new Date(body.payDate) : new Date()
  const frequency = source.payFrequency === 'monthly' ? 'monthly' : 'fortnightly'
  const annualPackageAmount = source.annualPackageAmount ?? source.amount
  const cycle = await prisma.payCycle.upsert({
    where: { userId_incomeSourceId: { userId, incomeSourceId: id } },
    create: { userId, incomeSourceId: id, frequency, annualPackageAmount, firstPayDate: payDate, endDate: source.payEndDate, retainHistory: source.retainPayHistory },
    update: {},
  })
  const startDate = new Date(payDate)
  if (frequency === 'monthly') {
    const day = startDate.getUTCDate()
    startDate.setUTCDate(1)
    startDate.setUTCMonth(startDate.getUTCMonth() - 1)
    const last = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, 0)).getUTCDate()
    startDate.setUTCDate(Math.min(day, last))
  } else startDate.setUTCDate(startDate.getUTCDate() - 13)
  const period = await prisma.payPeriod.upsert({
    where: { cycleId_startDate: { cycleId: cycle.id, startDate } },
    create: { userId, cycleId: cycle.id, startDate, endDate: payDate, payDate, expectedGross: annualPackageAmount / (frequency === 'monthly' ? 12 : 26) },
    update: {},
  })
  return NextResponse.json({ period, idempotent: true }, { status: 201 })
}