export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

function num(v: any, d = 0): number { const n = parseFloat(v); return isNaN(n) ? d : n }
function numOrNull(v: any): number | null { if (v === '' || v == null) return null; const n = parseFloat(v); return isNaN(n) ? null : n }

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id

  const liabilities = await prisma.liability.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } })
  const active = liabilities.filter((l) => l.isActive)
  const totalDebt = active.reduce((s, l) => s + (l.currentBalance ?? 0), 0)
  const weightedRate = totalDebt > 0
    ? active.reduce((s, l) => s + (l.currentBalance ?? 0) * (l.interestRate ?? 0), 0) / totalDebt
    : 0
  const annualInterest = active.reduce((s, l) => s + (l.currentBalance ?? 0) * (l.interestRate ?? 0) / 100, 0)

  return NextResponse.json({
    liabilities,
    summary: {
      totalDebt: Math.round(totalDebt * 100) / 100,
      weightedRate: Math.round(weightedRate * 100) / 100,
      annualInterest: Math.round(annualInterest * 100) / 100,
      count: active.length,
    },
  })
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const b = await request.json()

  const liability = await prisma.liability.create({
    data: {
      userId,
      name: b.name,
      liabilityType: b.liabilityType ?? 'other',
      currentBalance: num(b.currentBalance),
      originalAmount: numOrNull(b.originalAmount),
      linkedAccountId: b.linkedAccountId || null,
      linkedAssetId: b.linkedAssetId || null,
      interestRate: num(b.interestRate),
      cashRate: numOrNull(b.cashRate),
      btRate: numOrNull(b.btRate),
      btFee: numOrNull(b.btFee),
      btEndDate: b.btEndDate ? new Date(b.btEndDate) : null,
      btFromLiabilityId: b.btFromLiabilityId || null,
      annualFee: numOrNull(b.annualFee),
      monthlyFee: numOrNull(b.monthlyFee),
      oneOffFee: numOrNull(b.oneOffFee),
      recurringFee: numOrNull(b.recurringFee),
      recurringFeeFrequency: b.recurringFeeFrequency || null,
      termMonths: b.termMonths ? parseInt(b.termMonths) : null,
      repaymentAmount: numOrNull(b.repaymentAmount),
      repaymentFrequency: b.repaymentFrequency || null,
      repaymentMethod: b.repaymentMethod || null,
      minPayment: numOrNull(b.minPayment) ?? numOrNull(b.repaymentAmount),
      startDate: b.startDate ? new Date(b.startDate) : null,
      numRepayments: b.numRepayments ? parseInt(b.numRepayments) : null,
      totalFees: numOrNull(b.totalFees),
      totalInterest: numOrNull(b.totalInterest),
      notes: b.notes || null,
    },
  })
  return NextResponse.json(liability, { status: 201 })
}
