export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { deriveDebtBalance, previewSimpleInterest, verifyDebtPreviewToken } from '@/lib/interpersonal-debt'
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const id = (await params).id; const body = await request.json(); const userId = (session.user as any).id
    const movement = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`
      const agreement = await tx.debtAgreement.findFirst({ where: { id, userId }, include: { movements: { orderBy: { effectiveAt: 'asc' } } } })
      if (!agreement) throw new Error('Debt agreement not found')
      const last = agreement.movements.filter((m) => m.type === 'confirmed_interest').at(-1)
      const from = last?.effectiveAt ?? agreement.interestEffectiveAt ?? agreement.createdAt
      if (!body.previewToken || !agreement.annualInterestRate || !agreement.interestEffectiveAt) throw new Error('Invalid interest preview')
      const payload = JSON.parse(Buffer.from(String(body.previewToken).split('.')[0], 'base64url').toString()); const through = new Date(payload.throughDate)
      const preview = previewSimpleInterest({ balance: deriveDebtBalance(agreement.movements, agreement.direction), annualRate: Number(agreement.annualInterestRate), from, through })
      const result = { ...preview, amount: preview.interest, interestAmount: preview.interest, throughDate: through.toISOString(), explanation: `${preview.months} complete monthly period(s)` }
      if (!verifyDebtPreviewToken(body.previewToken, id, agreement.movements, result)) throw new Error('Interest preview is stale; generate a new preview')
      if (preview.months <= 0 || preview.interest <= 0) throw new Error('No interest is due for this period')
      if (deriveDebtBalance(agreement.movements, agreement.direction) <= 0) throw new Error('Interest is not charged on a zero or negative balance')
      return tx.debtMovement.create({ data: { agreementId: id, createdById: userId, type: 'confirmed_interest', amount: preview.interest, effectiveAt: through, description: `Confirmed simple interest through ${through.toISOString()}` } })
    }, { isolationLevel: 'Serializable' })
    return NextResponse.json(movement, { status: 201 })
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Invalid request' }, { status: 409 }) }
}