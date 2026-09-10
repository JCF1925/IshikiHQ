export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

function num(v: any, d = 0): number { const n = parseFloat(v); return isNaN(n) ? d : n }

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params
  const b = await request.json()
  const existing = await prisma.financialPlan.findFirst({ where: { id, userId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const data: any = {}
  if (b.name !== undefined) data.name = b.name
  if (b.notes !== undefined) data.notes = b.notes || null
  for (const k of ['currentSalary', 'currentSuperBalance', 'currentInvestments', 'currentCash', 'inflationRate', 'wageGrowthRate', 'superReturnRate', 'investmentReturnRate', 'extraSuperContribution', 'annualSavings']) {
    if (b[k] !== undefined) data[k] = num(b[k])
  }
  for (const k of ['startYear', 'numYears', 'retirementYear']) {
    if (b[k] !== undefined) data[k] = b[k] ? parseInt(b[k]) : null
  }
  const plan = await prisma.financialPlan.update({ where: { id }, data, include: { events: { orderBy: { year: 'asc' } } } })
  return NextResponse.json(plan)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params
  const existing = await prisma.financialPlan.findFirst({ where: { id, userId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await prisma.financialPlan.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
