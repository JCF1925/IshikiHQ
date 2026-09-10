export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { apiError, parseBody } from '@/lib/api'
import { annualise, applyIncreases, splitSuper, taxBreakdown, helpRepayment, currentSuperRate, type Frequency } from '@/lib/tax'
import { incomeSourceCreateSchema } from '@/lib/validation'

function incomeFailure(action: 'load' | 'save', error: unknown) {
  const diagnosticId = randomUUID()
  console.error(`[income] ${action} failed`, {
    diagnosticId,
    error: error instanceof Error ? error.name : 'unknown',
  })
  return apiError(
    'INTERNAL_ERROR',
    action === 'load' ? 'Income data could not be loaded. Try again.' : 'Income source could not be saved. Check the fields and try again.',
    500,
    { diagnosticId },
  )
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  try {
    const [sources, orgs] = await Promise.all([
      prisma.incomeSource.findMany({
        where: { userId },
        include: { increases: { orderBy: [{ effectiveDate: 'asc' }, { createdAt: 'asc' }] } },
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      }),
      prisma.organisation.findMany({ where: { userId }, select: { id: true, name: true } }),
    ])

    const now = new Date()
    const orgName = (id: string | null) => orgs.find((o) => o.id === id)?.name ?? null

    const enriched = sources.map((s) => {
      // current stated amount at this source's frequency, after increases effective by now
      const currentStated = applyIncreases(s.amount, s.increases, now)
      const statedAnnual = annualise(currentStated, s.frequency as Frequency, s.hoursPerWeek)
      const effSuperRate = currentSuperRate(s.superRate, s.increases as any, now)
      const { base, sg, totalPackage } = splitSuper(statedAnnual, effSuperRate, s.incSuper)
      // taxable base for salary = base (super is not assessable). For net-stated income we still
      // treat entered amount as taxable base approximation.
      const taxable = s.isGross ? base : base // net handling simplified; gross assumed for tax calc
      const tax = taxBreakdown(taxable)
      const help = helpRepayment(taxable)
      return {
        ...s,
        employerName: orgName(s.employerId),
        effectiveSuperRate: effSuperRate,
        currentStated,
        statedAnnual,
        baseAnnual: base,
        superAnnual: sg,
        totalPackage,
        annualIncomeTax: tax.incomeTax,
        annualMedicare: tax.medicare,
        annualHelp: help,
        annualNet: Math.round((base - tax.totalTax - help) * 100) / 100,
      }
    })

    return NextResponse.json(enriched)
  } catch (error) {
    return incomeFailure('load', error)
  }
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const parsed = await parseBody(request, incomeSourceCreateSchema)
  if (!parsed.success) return parsed.response
  const body = parsed.data
  try {
    const [employer, account] = await Promise.all([
      body.employerId ? prisma.organisation.findFirst({ where: { id: body.employerId, userId }, select: { id: true } }) : null,
      body.payAccountId ? prisma.finAccount.findFirst({ where: { id: body.payAccountId, userId }, select: { id: true } }) : null,
    ])
    if (body.employerId && !employer) {
      return apiError('VALIDATION_ERROR', 'Employer is no longer available. Choose another employer.', 400, [{ field: 'employerId', message: 'Employer is not owned by this account' }])
    }
    if (body.payAccountId && !account) {
      return apiError('VALIDATION_ERROR', 'Pay account is no longer available. Choose another account.', 400, [{ field: 'payAccountId', message: 'Pay account is not owned by this account' }])
    }

    const src = await prisma.incomeSource.create({
      data: {
        userId,
        name: body.name,
        type: body.type,
        employerId: body.employerId ?? null,
        amount: body.amount,
        frequency: body.frequency,
        hoursPerWeek: body.hoursPerWeek ?? null,
        isGross: body.isGross,
        incSuper: body.incSuper,
        superRate: body.superRate,
        payAccountId: body.payAccountId ?? null,
        startDate: body.startDate,
        endDate: body.endDate ?? null,
        isActive: body.isActive,
        notes: body.notes ?? null,
        annualPackageAmount: body.annualPackageAmount ?? null,
        payFrequency: body.payFrequency ?? null,
        firstPayDate: body.firstPayDate ?? null,
        payEndDate: body.payEndDate ?? null,
        retainPayHistory: body.retainPayHistory ?? true,
      },
    })
    return NextResponse.json(src, { status: 201 })
  } catch (error) {
    return incomeFailure('save', error)
  }
}
