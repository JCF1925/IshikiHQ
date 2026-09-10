export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

function num(v: any, d = 0): number { const n = parseFloat(v); return isNaN(n) ? d : n }

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id

  const [assets, liabilities] = await Promise.all([
    prisma.asset.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
    prisma.liability.findMany({ where: { userId, isActive: true } }),
  ])

  const liabMap = new Map(liabilities.map((l) => [l.id, l]))
  const enriched = assets.map((a) => {
    const linked = a.linkedLiabilityId ? liabMap.get(a.linkedLiabilityId) : null
    const debt = linked?.currentBalance ?? 0
    return {
      ...a,
      linkedLiabilityName: linked?.name ?? null,
      linkedLiabilityBalance: debt,
      equity: Math.round(((a.currentValue ?? 0) - debt) * 100) / 100,
    }
  })

  const activeAssets = enriched.filter((a) => a.isActive && !a.isProvisional)
  const totalValue = activeAssets.reduce((s, a) => s + (a.currentValue ?? 0), 0)
  const totalEquity = activeAssets.reduce((s, a) => s + (a.equity ?? 0), 0)
  const annualIncome = activeAssets.reduce((s, a) => s + (a.currentValue ?? 0) * (a.incomeRate ?? 0) / 100, 0)

  return NextResponse.json({
    assets: enriched,
    summary: {
      totalValue: Math.round(totalValue * 100) / 100,
      totalEquity: Math.round(totalEquity * 100) / 100,
      annualIncome: Math.round(annualIncome * 100) / 100,
      count: activeAssets.length,
    },
  })
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const body = await request.json()

  let linkedLiabilityId: string | null = body.linkedLiabilityId ?? null

  // Optionally create an associated liability (e.g. a mortgage) in the same call
  if (body.createLiability && body.liability?.name) {
    const lb = body.liability
    const created = await prisma.liability.create({
      data: {
        userId,
        name: lb.name,
        liabilityType: lb.liabilityType ?? 'mortgage',
        currentBalance: num(lb.currentBalance),
        originalAmount: lb.originalAmount != null ? num(lb.originalAmount) : null,
        interestRate: num(lb.interestRate),
        termMonths: lb.termMonths ? parseInt(lb.termMonths) : null,
        repaymentAmount: lb.repaymentAmount != null ? num(lb.repaymentAmount) : null,
        repaymentFrequency: lb.repaymentFrequency ?? 'monthly',
        repaymentMethod: lb.repaymentMethod ?? 'principal_and_interest',
        minPayment: lb.repaymentAmount != null ? num(lb.repaymentAmount) : null,
        startDate: lb.startDate ? new Date(lb.startDate) : null,
      },
    })
    linkedLiabilityId = created.id
  }

  const asset = await prisma.asset.create({
    data: {
      userId,
      name: body.name,
      assetType: body.assetType ?? 'other',
      currentValue: num(body.currentValue),
      purchaseValue: body.purchaseValue != null && body.purchaseValue !== '' ? num(body.purchaseValue) : null,
      purchaseDate: body.purchaseDate ? new Date(body.purchaseDate) : null,
      growthRate: num(body.growthRate),
      incomeRate: num(body.incomeRate),
      ongoingCostAnnual: num(body.ongoingCostAnnual),
      quantity: body.quantity != null && body.quantity !== '' ? num(body.quantity) : null,
      unitCode: body.unitCode || null,
      linkedAccountId: body.linkedAccountId || null,
      isProvisional: !!body.isProvisional,
      acquisitionDate: body.acquisitionDate ? new Date(body.acquisitionDate) : null,
      upfrontCost: num(body.upfrontCost),
      linkedLiabilityId,
      notes: body.notes || null,
    },
  })
  return NextResponse.json(asset, { status: 201 })
}
