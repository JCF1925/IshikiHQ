// Pure, client-safe finance helpers for Phase 3 (Wealth & Long-Term Planning).
// No Prisma / server imports here so it can be used in client components too.

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export type DebtInput = {
  id: string
  name: string
  balance: number
  interestRate: number // annual %
  minPayment: number
}

export type PaydownResult = {
  strategy: 'avalanche' | 'snowball'
  months: number
  totalInterest: number
  payoffOrder: { id: string; name: string; payoffMonth: number; interestPaid: number }[]
  schedule: { month: number; totalBalance: number; interest: number }[]
}

// Simulate paying off a set of debts with a fixed total monthly budget.
// Avalanche = highest interest first; Snowball = smallest balance first.
export function simulatePaydown(
  debts: DebtInput[],
  monthlyBudget: number,
  strategy: 'avalanche' | 'snowball',
): PaydownResult {
  const working = debts
    .filter((d) => d.balance > 0)
    .map((d) => ({ ...d, interestPaid: 0, payoffMonth: 0 }))

  const totalMin = working.reduce((s, d) => s + Math.max(0, d.minPayment), 0)
  const schedule: { month: number; totalBalance: number; interest: number }[] = []
  let month = 0
  const budget = Math.max(monthlyBudget, totalMin)

  // Guard against infinite loops (budget too small to ever clear interest)
  const MAX_MONTHS = 1200

  while (working.some((d) => d.balance > 0.01) && month < MAX_MONTHS) {
    month++
    let monthInterest = 0
    // 1. Accrue interest
    for (const d of working) {
      if (d.balance <= 0) continue
      const i = round2(d.balance * (d.interestRate / 100) / 12)
      d.balance = round2(d.balance + i)
      d.interestPaid = round2(d.interestPaid + i)
      monthInterest = round2(monthInterest + i)
    }
    // 2. Determine priority order for the extra above minimums
    const active = working.filter((d) => d.balance > 0.01)
    const ordered = [...active].sort((a, b) =>
      strategy === 'avalanche' ? b.interestRate - a.interestRate : a.balance - b.balance,
    )
    // 3. Pay minimums first
    let pool = budget
    for (const d of active) {
      const pay = Math.min(d.minPayment, d.balance, pool)
      d.balance = round2(d.balance - pay)
      pool = round2(pool - pay)
    }
    // 4. Throw the rest at the priority debt
    for (const d of ordered) {
      if (pool <= 0) break
      if (d.balance <= 0) continue
      const pay = Math.min(pool, d.balance)
      d.balance = round2(d.balance - pay)
      pool = round2(pool - pay)
    }
    // 5. Mark newly-cleared debts
    for (const d of working) {
      if (d.balance <= 0.01 && d.payoffMonth === 0) d.payoffMonth = month
    }
    const totalBalance = round2(working.reduce((s, d) => s + Math.max(0, d.balance), 0))
    schedule.push({ month, totalBalance, interest: monthInterest })
  }

  const totalInterest = round2(working.reduce((s, d) => s + d.interestPaid, 0))
  const payoffOrder = working
    .map((d) => ({ id: d.id, name: d.name, payoffMonth: d.payoffMonth || month, interestPaid: d.interestPaid }))
    .sort((a, b) => a.payoffMonth - b.payoffMonth)

  return { strategy, months: month, totalInterest, payoffOrder, schedule }
}

// ─── Net-worth / retirement forecasting ─────────────────────
export type PlanInputs = {
  startYear: number
  numYears: number
  currentSalary: number
  currentSuperBalance: number
  currentInvestments: number
  currentCash: number
  inflationRate: number
  wageGrowthRate: number
  superReturnRate: number
  investmentReturnRate: number
  extraSuperContribution: number
  annualSavings: number
  retirementYear?: number | null
  superGuaranteeRate?: number // default 12
}

export type PlanEventInput = {
  label: string
  year: number
  kind: string // expense, asset_purchase, income_change, lump_sum, windfall
  amount: number
  isDebtFunded: boolean
  isRecurring: boolean
  endYear?: number | null
}

export type ForecastRow = {
  year: number
  age?: number
  salary: number
  superBalance: number
  investments: number
  cash: number
  netWorth: number
  netWorthReal: number // inflation-adjusted to start year
  retired: boolean
  events: string[]
}

export function projectPlan(inputs: PlanInputs, events: PlanEventInput[]): ForecastRow[] {
  const sgRate = (inputs.superGuaranteeRate ?? 12) / 100
  const rows: ForecastRow[] = []
  let salary = inputs.currentSalary
  let superBal = inputs.currentSuperBalance
  let investments = inputs.currentInvestments
  let cash = inputs.currentCash

  for (let i = 0; i < inputs.numYears; i++) {
    const year = inputs.startYear + i
    const retired = inputs.retirementYear != null && year >= inputs.retirementYear
    const yearEvents = events.filter(
      (e) => e.year === year || (e.isRecurring && year >= e.year && (e.endYear == null || year <= e.endYear)),
    )

    // Income & wage growth
    if (i > 0 && !retired) salary = round2(salary * (1 + inputs.wageGrowthRate / 100))
    if (retired) salary = 0

    // Super: guarantee + extra, then growth
    if (!retired) {
      superBal = round2(superBal + salary * sgRate + inputs.extraSuperContribution)
    }
    superBal = round2(superBal * (1 + inputs.superReturnRate / 100))

    // Investments: annual savings + growth
    if (!retired) investments = round2(investments + inputs.annualSavings)
    investments = round2(investments * (1 + inputs.investmentReturnRate / 100))

    // Cash growth (kept flat-ish; grows with inflation-linked interest)
    cash = round2(cash)

    // Apply events
    const eventLabels: string[] = []
    for (const e of yearEvents) {
      eventLabels.push(e.label)
      if (e.kind === 'lump_sum' || e.kind === 'windfall') {
        cash = round2(cash + e.amount)
      } else if (e.kind === 'asset_purchase') {
        if (!e.isDebtFunded) investments = round2(investments - e.amount)
        // debt-funded purchases are netted against a new liability; net worth neutral at purchase
      } else if (e.kind === 'expense') {
        // draw from cash first, then investments
        if (cash >= e.amount) cash = round2(cash - e.amount)
        else { const rem = e.amount - cash; cash = 0; investments = round2(investments - rem) }
      } else if (e.kind === 'income_change') {
        salary = round2(salary + e.amount)
      }
    }

    const netWorth = round2(superBal + investments + cash)
    const deflator = Math.pow(1 + inputs.inflationRate / 100, i)
    const netWorthReal = round2(netWorth / deflator)

    rows.push({
      year,
      salary: round2(salary),
      superBalance: superBal,
      investments,
      cash,
      netWorth,
      netWorthReal,
      retired,
      events: eventLabels,
    })
  }
  return rows
}
