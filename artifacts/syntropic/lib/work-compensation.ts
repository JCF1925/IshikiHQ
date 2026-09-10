import { round2 } from '@/lib/tax'

export type ApprovedPayChange = {
  id?: string
  effectiveDate: Date | string
  createdAt?: Date | string
  changeType: string
  value: number
  newSuperRate?: number | null
  status?: string
}

export type CompensationPoint = {
  effectiveFrom: Date
  amount: number
  superRate: number
}

// Derives the complete role timeline, rather than incrementally appending one
// row. This makes an approval entered out of chronological order repair every
// later amount and SG rate deterministically.
export function buildCompensationTimeline(input: {
  baseAmount: number
  baseSuperRate: number
  sourceStartDate: Date
  roleStartDate: Date
  changes: ApprovedPayChange[]
}): CompensationPoint[] {
  const start = input.roleStartDate > input.sourceStartDate ? input.roleStartDate : input.sourceStartDate
  const changes = input.changes
    .filter((change) => change.status == null || change.status === 'approved')
    .sort((a, b) => {
      const byDate = new Date(a.effectiveDate).getTime() - new Date(b.effectiveDate).getTime()
      if (byDate) return byDate
      const byCreated = new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime()
      return byCreated || (a.id ?? '').localeCompare(b.id ?? '')
    })

  let amount = Number(input.baseAmount) || 0
  let superRate = Number(input.baseSuperRate) || 0
  for (const change of changes) {
    if (new Date(change.effectiveDate) > start) break
    ;({ amount, superRate } = applyChange(amount, superRate, change))
  }

  const points: CompensationPoint[] = [{ effectiveFrom: start, amount: round2(amount), superRate }]
  for (const change of changes) {
    const effectiveFrom = new Date(change.effectiveDate)
    if (effectiveFrom <= start) continue
    ;({ amount, superRate } = applyChange(amount, superRate, change))
    const prior = points.at(-1)
    // Multiple approved changes may share a date. Persist one final cumulative
    // row because the database key is (roleId, effectiveFrom).
    if (prior && prior.effectiveFrom.getTime() === effectiveFrom.getTime()) {
      prior.amount = round2(amount)
      prior.superRate = superRate
    } else {
      points.push({ effectiveFrom, amount: round2(amount), superRate })
    }
  }
  return points
}

function applyChange(amount: number, superRate: number, change: ApprovedPayChange) {
  if (change.changeType === 'amount') amount += Number(change.value) || 0
  if (change.changeType === 'percent') amount *= 1 + (Number(change.value) || 0) / 100
  if (change.changeType === 'sg_rate') superRate = Number(change.newSuperRate ?? change.value) || 0
  return { amount, superRate }
}