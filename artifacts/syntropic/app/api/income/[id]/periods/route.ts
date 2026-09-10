export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { payPeriodDates } from '@/lib/recurrence'
import { payCycleSchema, payPeriodConfirmationSchema } from '@/lib/validation'
import { parseBody, apiError } from '@/lib/api'

async function owned(id: string, userId: string) {
  return prisma.incomeSource.findFirst({ where: { id, userId }, include: { payCycles: true } })
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const source = await owned((await params).id, userId)
  if (!source) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const cycle = source.payCycles[0]
  if (!cycle) return NextResponse.json({ cycle: null, periods: [] })
  const periods = await prisma.payPeriod.findMany({
    where: { cycleId: cycle.id, userId },
    include: { transactions: { include: { transaction: true } }, reimbursementTransaction: true, workEvidence: true, patternSnapshot: true },
    orderBy: { payDate: 'desc' },
  })
  const candidates = await prisma.transaction.findMany({
    where: { userId, date: { gte: new Date(Date.now() - 45 * 86400000), lte: new Date(Date.now() + 45 * 86400000) }, ...(source.payAccountId ? { accountId: source.payAccountId } : {}) },
    select: { id: true, date: true, amount: true, description: true, merchant: true },
    orderBy: { date: 'desc' }, take: 100,
  })
  return NextResponse.json({ cycle, periods, candidates })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const source = await owned((await params).id, userId)
  if (!source) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const parsed = await parseBody(request, payCycleSchema)
  if (!parsed.success) return parsed.response
  const input = parsed.data
  const cycle = await prisma.payCycle.upsert({
    where: { userId_incomeSourceId: { userId, incomeSourceId: source.id } },
    create: { userId, incomeSourceId: source.id, ...input, endDate: input.endDate ?? null },
    update: { ...input, endDate: input.endDate ?? null },
  })
  const through = new Date()
  through.setUTCDate(through.getUTCDate() + 60)
  const dates = payPeriodDates(input.firstPayDate, input.frequency, through, input.endDate, 8)
  for (const date of dates) {
    await prisma.payPeriod.upsert({
      where: { cycleId_startDate: { cycleId: cycle.id, startDate: date.startDate } },
      create: { userId, cycleId: cycle.id, ...date, expectedGross: input.annualPackageAmount / (input.frequency === 'monthly' ? 12 : 26) },
      update: {},
    })
  }
  if (!input.retainHistory) {
    const cutoff = new Date()
    cutoff.setUTCDate(cutoff.getUTCDate() - 60)
    const old = await prisma.payPeriod.findMany({ where: { cycleId: cycle.id, startDate: { lt: cutoff } }, select: { id: true, reimbursementTransactionId: true } })
    const oldIds = old.map((p) => p.id)
    await prisma.$transaction(async (tx) => {
      if (!oldIds.length) return
      await tx.payPeriodTransaction.deleteMany({ where: { periodId: { in: oldIds } } })
      await tx.workEvidence.deleteMany({ where: { periodId: { in: oldIds } } })
      await tx.workPatternSnapshot.deleteMany({ where: { periodId: { in: oldIds } } })
      await tx.payComponent.deleteMany({ where: { periodId: { in: oldIds } } })
      const generated = old.map((p) => p.reimbursementTransactionId).filter((id): id is string => Boolean(id))
      if (generated.length) await tx.transaction.deleteMany({ where: { id: { in: generated }, userId, tags: { has: 'salary_packaging_reimbursement' } } })
      await tx.payPeriod.updateMany({ where: { id: { in: oldIds } }, data: { reimbursementTransactionId: null } })
    })
  }
  return NextResponse.json({ cycle, generated: dates.length }, { status: 201 })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const period = await prisma.payPeriod.findFirst({ where: { id, userId }, include: { cycle: { include: { incomeSource: true } } } })
  if (!period) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const parsed = payPeriodConfirmationSchema.safeParse(body)
  if (!parsed.success) return apiError('VALIDATION_ERROR', 'Please correct the pay confirmation.', 400)
  const input = parsed.data
  const links = input.transactionIds.length
    ? await prisma.transaction.findMany({ where: { id: { in: input.transactionIds }, userId }, select: { id: true } })
    : []
  if (links.length !== input.transactionIds.length) return apiError('VALIDATION_ERROR', 'One or more transactions are not owned by this account.', 400)
  const updated = await prisma.$transaction(async (tx) => {
    await tx.payPeriodTransaction.deleteMany({ where: { periodId: period.id } })
    if (links.length) await tx.payPeriodTransaction.createMany({ data: links.map((t) => ({ userId, periodId: period.id, transactionId: t.id, kind: 'gross' })) })
    let reimbursementTransactionId = period.reimbursementTransactionId
    if (input.reimbursementAmount > 0) {
      const data = { userId, date: period.payDate, amount: input.reimbursementAmount, currency: 'AUD', merchant: period.cycle.incomeSource.name, description: `Salary packaging reimbursement — ${period.cycle.incomeSource.name}`, category: 'Salary Packaging', accountId: period.cycle.incomeSource.payAccountId, tags: ['payrun', `income:${period.cycle.incomeSourceId}`, 'salary_packaging_reimbursement'], status: 'pending' as const }
      if (reimbursementTransactionId) await tx.transaction.update({ where: { id: reimbursementTransactionId }, data })
      else reimbursementTransactionId = (await tx.transaction.create({ data })).id
      await tx.payPeriodTransaction.upsert({ where: { periodId_transactionId: { periodId: period.id, transactionId: reimbursementTransactionId } }, create: { userId, periodId: period.id, transactionId: reimbursementTransactionId, kind: 'reimbursement' }, update: { kind: 'reimbursement' } })
    } else if (reimbursementTransactionId) {
      await tx.transaction.delete({ where: { id: reimbursementTransactionId } })
      reimbursementTransactionId = null
    }
    await tx.payComponent.deleteMany({ where: { periodId: period.id, kind: 'salary_packaging_reimbursement' } })
    if (input.reimbursementAmount > 0) {
      await tx.payComponent.create({ data: { userId, cycleId: period.cycleId, periodId: period.id, kind: 'salary_packaging_reimbursement', amount: input.reimbursementAmount, description: 'Salary packaging reimbursement' } })
    }
    if (input.work) await tx.workEvidence.upsert({ where: { periodId: period.id }, create: { userId, periodId: period.id, ...input.work, leaveType: input.work.leaveType ?? null, location: input.work.location ?? null, notes: input.work.notes ?? null }, update: input.work })
    if (input.work) {
      await tx.workPatternSnapshot.upsert({ where: { periodId: period.id }, create: { userId, periodId: period.id, patternType: input.work.evidenceType, pattern: input.work }, update: { patternType: input.work.evidenceType, pattern: input.work } })
    }
    return tx.payPeriod.update({ where: { id: period.id }, data: { confirmedGross: input.confirmedGross, reimbursementAmount: input.reimbursementAmount, reimbursementTransactionId, reconciliationDifference: input.confirmedGross - (period.expectedGross ?? input.confirmedGross), status: 'confirmed', confirmedAt: new Date() }, include: { workEvidence: true, patternSnapshot: true, transactions: true } })
  })
  return NextResponse.json(updated)
}