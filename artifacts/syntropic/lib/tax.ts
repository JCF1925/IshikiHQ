// lib/tax.ts — Australian personal tax engine (pure, client-safe).
// All rate tables are local and editable. Labelled with the financial year they apply to.
// Sources: ATO resident rates 2026-27; HELP marginal repayment system 2025-26; SG rate 12% (2025-26+).

export type Frequency = 'hourly' | 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'annually'

export const CURRENT_FY = '2026-27'
export const SUPER_GUARANTEE_RATE = 12 // % (2025-26 and 2026-27)

// ── Resident income tax brackets — FY 2026-27 ──
// base = cumulative tax at the bracket's lower bound.
export const RESIDENT_TAX_BRACKETS = [
  { min: 0, max: 18200, rate: 0, base: 0 },
  { min: 18200, max: 45000, rate: 0.15, base: 0 },
  { min: 45000, max: 135000, rate: 0.3, base: 4020 },
  { min: 135000, max: 190000, rate: 0.37, base: 31020 },
  { min: 190000, max: Infinity, rate: 0.45, base: 51370 },
]

// ── Medicare levy — 2% with single low-income shade-in (2024-25 thresholds) ──
export const MEDICARE_LEVY_RATE = 0.02
export const MEDICARE_LOWER = 27222
export const MEDICARE_UPPER = 34027

// ── HELP/HECS marginal repayment — FY 2025-26 ──
// Repayment on income within each band; top band is a flat 10% of total repayment income.
export const HELP_BRACKETS = [
  { min: 0, max: 67000, rate: 0, base: 0 },
  { min: 67000, max: 125000, rate: 0.15, base: 0 },
  { min: 125000, max: 179285, rate: 0.17, base: 8700 },
]
export const HELP_TOP_THRESHOLD = 179285
export const HELP_TOP_FLAT_RATE = 0.1 // of total repayment income

export const CGT_DISCOUNT_RATE = 0.5 // 50% discount for assets held > 12 months

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

// Annualise an amount stated at a given frequency.
export function annualise(amount: number, frequency: Frequency, hoursPerWeek?: number | null): number {
  const a = Number(amount) || 0
  switch (frequency) {
    case 'hourly':
      return a * (Number(hoursPerWeek) || 0) * 52
    case 'weekly':
      return a * 52
    case 'fortnightly':
      return a * 26
    case 'monthly':
      return a * 12
    case 'quarterly':
      return a * 4
    case 'annually':
    default:
      return a
  }
}

// Convert an annual amount back to a per-period amount.
export function perPeriod(annual: number, frequency: Frequency, hoursPerWeek?: number | null): number {
  switch (frequency) {
    case 'hourly': {
      const hrs = (Number(hoursPerWeek) || 0) * 52
      return hrs > 0 ? annual / hrs : 0
    }
    case 'weekly':
      return annual / 52
    case 'fortnightly':
      return annual / 26
    case 'monthly':
      return annual / 12
    case 'quarterly':
      return annual / 4
    case 'annually':
    default:
      return annual
  }
}

// Income tax (excludes Medicare levy) for a taxable income.
export function incomeTax(taxable: number): number {
  const t = Math.max(0, Number(taxable) || 0)
  for (let i = RESIDENT_TAX_BRACKETS.length - 1; i >= 0; i--) {
    const b = RESIDENT_TAX_BRACKETS[i]
    if (t > b.min) return round2(b.base + (t - b.min) * b.rate)
  }
  return 0
}

// Medicare levy with single low-income shade-in.
export function medicareLevy(taxable: number): number {
  const t = Math.max(0, Number(taxable) || 0)
  if (t <= MEDICARE_LOWER) return 0
  if (t <= MEDICARE_UPPER) return round2((t - MEDICARE_LOWER) * 0.1)
  return round2(t * MEDICARE_LEVY_RATE)
}

// Compulsory HELP repayment for a repayment income (marginal system).
export function helpRepayment(repaymentIncome: number): number {
  const ri = Math.max(0, Number(repaymentIncome) || 0)
  if (ri > HELP_TOP_THRESHOLD) return round2(ri * HELP_TOP_FLAT_RATE)
  for (let i = HELP_BRACKETS.length - 1; i >= 0; i--) {
    const b = HELP_BRACKETS[i]
    if (ri > b.min) return round2(b.base + (ri - b.min) * b.rate)
  }
  return 0
}

export type TaxBreakdown = {
  taxable: number
  incomeTax: number
  medicare: number
  totalTax: number
  net: number // after income tax + medicare (before HELP)
  averageRate: number
  marginalRate: number
}

export function marginalRate(taxable: number): number {
  const t = Math.max(0, Number(taxable) || 0)
  for (let i = RESIDENT_TAX_BRACKETS.length - 1; i >= 0; i--) {
    const b = RESIDENT_TAX_BRACKETS[i]
    if (t > b.min) return b.rate
  }
  return 0
}

// Full breakdown for a taxable income.
export function taxBreakdown(taxable: number): TaxBreakdown {
  const t = Math.max(0, Number(taxable) || 0)
  const it = incomeTax(t)
  const ml = medicareLevy(t)
  const total = round2(it + ml)
  return {
    taxable: round2(t),
    incomeTax: it,
    medicare: ml,
    totalTax: total,
    net: round2(t - total),
    averageRate: t > 0 ? total / t : 0,
    marginalRate: marginalRate(t),
  }
}

// Split a stated amount into base salary + super.
// incSuper=true means the stated amount already contains super.
export function splitSuper(
  statedAnnual: number,
  superRate: number,
  incSuper: boolean,
): { base: number; sg: number; totalPackage: number } {
  const rate = (Number(superRate) || 0) / 100
  const a = Number(statedAnnual) || 0
  if (incSuper) {
    const base = rate > 0 ? a / (1 + rate) : a
    return { base: round2(base), sg: round2(a - base), totalPackage: round2(a) }
  }
  const sg = a * rate
  return { base: round2(a), sg: round2(sg), totalPackage: round2(a + sg) }
}

export type SalaryIncrease = { effectiveDate: string | Date; changeType: string; value: number; status?: string }

// Apply confirmed increases with effectiveDate on/before `at` cumulatively to a base amount.
export function applyIncreases(baseAmount: number, increases: SalaryIncrease[], at: Date): number {
  let amt = Number(baseAmount) || 0
  const sorted = [...(increases || [])]
    .filter((i) => (i.status == null || i.status === 'approved') && new Date(i.effectiveDate) <= at)
    .sort((a, b) => new Date(a.effectiveDate).getTime() - new Date(b.effectiveDate).getTime())
  for (const inc of sorted) {
    if (inc.changeType === 'amount') amt += Number(inc.value) || 0
    else if (inc.changeType === 'percent') amt *= 1 + (Number(inc.value) || 0) / 100
    // 'sg_rate' changes only affect the super guarantee rate, not the pay amount
  }
  return round2(amt)
}

// Determine the effective super guarantee rate at `at`, honouring any 'sg_rate' change history.
export function currentSuperRate(
  baseRate: number,
  increases: Array<{ effectiveDate: string | Date; changeType: string; newSuperRate?: number | null; value?: number; status?: string }>,
  at: Date,
): number {
  let rate = Number(baseRate) || 0
  const sorted = [...(increases || [])]
    .filter((i) => (i.status == null || i.status === 'approved') && i.changeType === 'sg_rate' && new Date(i.effectiveDate) <= at)
    .sort((a, b) => new Date(a.effectiveDate).getTime() - new Date(b.effectiveDate).getTime())
  for (const inc of sorted) {
    const r = inc.newSuperRate != null ? Number(inc.newSuperRate) : Number(inc.value)
    if (!Number.isNaN(r)) rate = r
  }
  return rate
}

// Australian financial year helpers (1 Jul – 30 Jun).
export function fyOfDate(d: Date): string {
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth() // 0=Jan
  const startYear = m >= 6 ? y : y - 1 // Jul (6) onward = current year
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`
}

export function fyBounds(fy: string): { start: Date; end: Date } {
  const startYear = parseInt(fy.split('-')[0], 10)
  return {
    start: new Date(Date.UTC(startYear, 6, 1, 0, 0, 0)), // 1 Jul
    end: new Date(Date.UTC(startYear + 1, 5, 30, 23, 59, 59)), // 30 Jun
  }
}

// WFH fixed-rate (cents per hour) method — ATO 70c/hour from 2024-25.
export const WFH_CENTS_PER_HOUR = 0.7
export function wfhFixedRateDeduction(totalHours: number): number {
  return round2((Number(totalHours) || 0) * WFH_CENTS_PER_HOUR)
}

// Discounted capital gain for a single disposal.
export function capitalGain(
  acquireCost: number,
  disposalProceeds: number,
  acquireDate: Date,
  disposalDate: Date,
): { gross: number; discounted: number; heldMonths: number; eligible: boolean } {
  const gross = (Number(disposalProceeds) || 0) - (Number(acquireCost) || 0)
  const heldMs = disposalDate.getTime() - acquireDate.getTime()
  const heldMonths = heldMs / (1000 * 60 * 60 * 24 * 30.4375)
  const eligible = gross > 0 && heldMonths >= 12
  const discounted = eligible ? gross * CGT_DISCOUNT_RATE : gross
  return { gross: round2(gross), discounted: round2(discounted), heldMonths: Math.round(heldMonths), eligible }
}
