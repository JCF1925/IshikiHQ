export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import {
  annualise, applyIncreases, splitSuper, incomeTax, medicareLevy, helpRepayment,
  wfhFixedRateDeduction, capitalGain, fyBounds, fyOfDate, CURRENT_FY, type Frequency,
} from '@/lib/tax'

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const url = new URL(request.url)
  const fy = url.searchParams.get('fy') || CURRENT_FY
  const { start, end } = fyBounds(fy)
  const now = new Date()

  const [sources, txns, packaging, wfh, cgtEvents, helpDebts] = await Promise.all([
    prisma.incomeSource.findMany({ where: { userId, isActive: true }, include: { increases: true } }),
    prisma.transaction.findMany({
      where: { userId, isDeductible: true, date: { gte: start, lte: end } },
      select: { amount: true, isForecast: true, status: true, taxCategory: true, category: true, merchant: true, description: true, date: true },
    }),
    prisma.salaryPackaging.findMany({ where: { userId } }),
    prisma.wfhDiaryEntry.findMany({ where: { userId, date: { gte: start, lte: end } }, select: { hours: true } }),
    prisma.capitalGainEvent.findMany({ where: { userId } }),
    prisma.hELPDebt.findMany({ where: { userId } }),
  ])

  // ── Income (annual taxable base) ──
  let grossTaxable = 0
  let superAnnual = 0
  const incomeBreakdown = sources.map((s) => {
    const currentStated = applyIncreases(s.amount, s.increases, now)
    const statedAnnual = annualise(currentStated, s.frequency as Frequency, s.hoursPerWeek)
    const { base, sg } = splitSuper(statedAnnual, s.superRate, s.incSuper)
    grossTaxable += base
    superAnnual += sg
    return { id: s.id, name: s.name, baseAnnual: Math.round(base * 100) / 100, superAnnual: Math.round(sg * 100) / 100 }
  })
  grossTaxable = Math.round(grossTaxable * 100) / 100

  // ── Capital gains realised this FY (discounted) ──
  let netCapitalGain = 0
  for (const e of cgtEvents) {
    if (e.disposalDate && e.disposalProceeds != null) {
      const efy = e.financialYear || fyOfDate(new Date(e.disposalDate))
      if (efy === fy) {
        const cg = capitalGain(e.acquireCost, e.disposalProceeds, e.acquireDate, e.disposalDate)
        netCapitalGain += cg.discounted
      }
    }
  }
  netCapitalGain = Math.round(Math.max(0, netCapitalGain) * 100) / 100 // net loss doesn't reduce ordinary income

  // ── Deductions (actual = confirmed non-forecast; committed = forecast) ──
  let actualDeductions = 0
  let forecastDeductions = 0
  const byCategory: Record<string, { actual: number; forecast: number }> = {}
  for (const t of txns) {
    const mag = Math.abs(t.amount)
    const key = t.taxCategory || t.category || 'Uncategorised'
    byCategory[key] = byCategory[key] || { actual: 0, forecast: 0 }
    if (t.isForecast) { forecastDeductions += mag; byCategory[key].forecast += mag }
    else { actualDeductions += mag; byCategory[key].actual += mag }
  }
  actualDeductions = Math.round(actualDeductions * 100) / 100
  forecastDeductions = Math.round(forecastDeductions * 100) / 100

  // ── WFH fixed-rate (cents-per-hour) ──
  const wfhHours = Math.round(wfh.reduce((s, e) => s + (e.hours || 0), 0) * 100) / 100
  const wfhFixedRate = wfhFixedRateDeduction(wfhHours)

  // ── Reportable amounts feeding HELP repayment income ──
  const reportableFringe = Math.round(packaging.filter((p) => !p.isProvisional).reduce((s, p) => s + (p.reportableAmount || 0), 0) * 100) / 100

  // ── Comparator scenarios ──
  const scenario = (deductions: number) => {
    const taxable = Math.max(0, grossTaxable + netCapitalGain - deductions)
    const it = incomeTax(taxable)
    const ml = medicareLevy(taxable)
    const repaymentIncome = taxable + reportableFringe
    const help = helpRepayment(repaymentIncome)
    return {
      deductions: Math.round(deductions * 100) / 100,
      taxable: Math.round(taxable * 100) / 100,
      incomeTax: it,
      medicare: ml,
      help,
      repaymentIncome: Math.round(repaymentIncome * 100) / 100,
      totalTax: Math.round((it + ml + help) * 100) / 100,
      net: Math.round((taxable - it - ml - help) * 100) / 100,
    }
  }
  const noDeductions = scenario(0)
  const actual = scenario(actualDeductions)
  const actualForecast = scenario(actualDeductions + forecastDeductions)

  // ── Withholding vs liability (year-end position estimate) ──
  // Employer withholds as if no deductions; actual liability reflects claimed deductions.
  const withheldEstimate = noDeductions.totalTax
  const estRefundActual = Math.round((withheldEstimate - actual.totalTax) * 100) / 100
  const estRefundActualForecast = Math.round((withheldEstimate - actualForecast.totalTax) * 100) / 100

  const helpBalance = Math.round(helpDebts.reduce((s, d) => s + (d.currentBalance || 0), 0) * 100) / 100

  return NextResponse.json({
    fy,
    grossTaxable,
    superAnnual: Math.round(superAnnual * 100) / 100,
    netCapitalGain,
    reportableFringe,
    actualDeductions,
    forecastDeductions,
    deductionsByCategory: Object.entries(byCategory)
      .map(([category, v]) => ({ category, actual: Math.round(v.actual * 100) / 100, forecast: Math.round(v.forecast * 100) / 100 }))
      .sort((a, b) => b.actual + b.forecast - (a.actual + a.forecast)),
    incomeBreakdown,
    comparator: { noDeductions, actual, actualForecast },
    savingsFromActual: Math.round((noDeductions.totalTax - actual.totalTax) * 100) / 100,
    savingsFromForecast: Math.round((actual.totalTax - actualForecast.totalTax) * 100) / 100,
    help: {
      balance: helpBalance,
      repaymentActual: actual.help,
      repaymentActualForecast: actualForecast.help,
      repaymentIncomeActual: actual.repaymentIncome,
      repaymentIncomeActualForecast: actualForecast.repaymentIncome,
    },
    withholding: { withheldEstimate, estRefundActual, estRefundActualForecast },
    wfh: { hours: wfhHours, fixedRateDeduction: wfhFixedRate },
  })
}
