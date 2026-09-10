export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { getDerivedAccountBalances, materialiseDueTransactionLocks } from '@/lib/financial-truth'

function num(v: any, d = 0): number { const n = parseFloat(v); return isNaN(n) ? d : n }

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const plans = await prisma.financialPlan.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: { events: { orderBy: { year: 'asc' } } },
  })
  return NextResponse.json(plans)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const b = await request.json()

  // Seed the baseline from the user's real data if requested
  let baseline = {
    currentSalary: num(b.currentSalary),
    currentSuperBalance: num(b.currentSuperBalance),
    currentInvestments: num(b.currentInvestments),
    currentCash: num(b.currentCash),
  }
  if (b.seedFromData) {
    await materialiseDueTransactionLocks(userId)
    const [incomes, accounts] = await Promise.all([
      prisma.incomeSource.findMany({ where: { userId, isActive: true } }),
      getDerivedAccountBalances(userId, true),
    ])
    const bal = (a: any) => a.derivedBalance
    baseline = {
      currentSalary: incomes.reduce((s, i) => s + (i.amount ?? 0) * (i.frequency === 'annually' ? 1 : i.frequency === 'monthly' ? 12 : i.frequency === 'fortnightly' ? 26 : i.frequency === 'weekly' ? 52 : 1), 0),
      currentSuperBalance: accounts.filter((a) => a.type === 'super').reduce((s, a) => s + bal(a), 0),
      currentInvestments: accounts.filter((a) => a.type === 'investment').reduce((s, a) => s + bal(a), 0),
      currentCash: accounts.filter((a) => ['savings', 'transaction'].includes(a.type)).reduce((s, a) => s + bal(a), 0),
    }
  }

  const plan = await prisma.financialPlan.create({
    data: {
      userId,
      name: b.name || 'My Plan',
      startYear: b.startYear ? parseInt(b.startYear) : new Date().getFullYear(),
      numYears: b.numYears ? parseInt(b.numYears) : 30,
      ...baseline,
      inflationRate: num(b.inflationRate, 2.5),
      wageGrowthRate: num(b.wageGrowthRate, 3),
      superReturnRate: num(b.superReturnRate, 7),
      investmentReturnRate: num(b.investmentReturnRate, 6),
      extraSuperContribution: num(b.extraSuperContribution),
      annualSavings: num(b.annualSavings),
      retirementYear: b.retirementYear ? parseInt(b.retirementYear) : null,
      notes: b.notes || null,
    },
    include: { events: true },
  })
  return NextResponse.json(plan, { status: 201 })
}
