export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { debtPreviewToken, deriveDebtBalance, previewSimpleInterest } from '@/lib/interpersonal-debt'
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const id = (await params).id; const body = await request.json(); const through = new Date(body.throughDate)
    const agreement = await prisma.debtAgreement.findFirst({ where: { id, userId: (session.user as any).id }, include: { movements: { orderBy: { effectiveAt: 'asc' } } } })
    if (!agreement) throw new Error('Debt agreement not found')
    const confirmed = agreement.movements.filter((m) => m.type === 'confirmed_interest').at(-1)
    const from = confirmed?.effectiveAt ?? agreement.interestEffectiveAt ?? agreement.createdAt
    if (!agreement.annualInterestRate || !agreement.interestEffectiveAt || !Number.isFinite(through.getTime())) throw new Error('Interest rate, start date and through date are required')
    const balance = deriveDebtBalance(agreement.movements, agreement.direction); if (balance <= 0) throw new Error('Interest is not charged on a zero or negative balance')
    const preview = previewSimpleInterest({ balance, annualRate: Number(agreement.annualInterestRate), from, through, direction: agreement.direction })
    const result = { ...preview, amount: preview.interest, interestAmount: preview.interest, throughDate: through.toISOString(), explanation: `${preview.months} complete monthly period(s) from ${from.toISOString()}` }
    return NextResponse.json({ ...result, previewToken: debtPreviewToken(id, agreement.movements, result) })
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Invalid request' }, { status: 400 }) }
}