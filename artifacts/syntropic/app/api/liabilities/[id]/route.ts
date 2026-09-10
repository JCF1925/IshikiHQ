export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

function num(v: any, d = 0): number { const n = parseFloat(v); return isNaN(n) ? d : n }
function numOrNull(v: any): number | null { if (v === '' || v == null) return null; const n = parseFloat(v); return isNaN(n) ? null : n }

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params
  const b = await request.json()

  const existing = await prisma.liability.findFirst({ where: { id, userId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Action: record a repayment -> reduce balance and (optionally) add a transaction
  if (b.action === 'repayment') {
    const amount = num(b.amount)
    const newBalance = Math.max(0, Math.round((existing.currentBalance - amount) * 100) / 100)
    if (b.addTransaction) {
      await prisma.transaction.create({
        data: {
          userId,
          date: b.date ? new Date(b.date) : new Date(),
          amount: -Math.abs(amount),
          currency: 'AUD',
          merchant: existing.name,
          description: `Repayment – ${existing.name}`,
          category: 'Debt Repayment',
          accountId: b.accountId || existing.linkedAccountId || null,
          // Repayments remain pending until manually confirmed in the ledger.
          status: 'pending',
        },
      })
    }
    const updated = await prisma.liability.update({
      where: { id },
      data: { currentBalance: newBalance, isActive: newBalance > 0.01 },
    })
    return NextResponse.json(updated)
  }

  const data: any = {}
  for (const k of ['name', 'liabilityType', 'linkedAccountId', 'linkedAssetId', 'btFromLiabilityId', 'recurringFeeFrequency', 'repaymentFrequency', 'repaymentMethod', 'notes']) {
    if (b[k] !== undefined) data[k] = b[k] || null
  }
  for (const k of ['currentBalance', 'interestRate']) {
    if (b[k] !== undefined) data[k] = num(b[k])
  }
  for (const k of ['originalAmount', 'cashRate', 'btRate', 'btFee', 'annualFee', 'monthlyFee', 'oneOffFee', 'recurringFee', 'repaymentAmount', 'minPayment', 'totalFees', 'totalInterest']) {
    if (b[k] !== undefined) data[k] = numOrNull(b[k])
  }
  for (const k of ['termMonths', 'numRepayments']) {
    if (b[k] !== undefined) data[k] = b[k] ? parseInt(b[k]) : null
  }
  for (const k of ['btEndDate', 'startDate']) {
    if (b[k] !== undefined) data[k] = b[k] ? new Date(b[k]) : null
  }
  if (b.isActive !== undefined) data.isActive = !!b.isActive

  const liability = await prisma.liability.update({ where: { id }, data })
  return NextResponse.json(liability)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params
  const existing = await prisma.liability.findFirst({ where: { id, userId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await prisma.liability.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
