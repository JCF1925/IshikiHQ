export type ForecastInput = { now: Date; stock: number; reorderThreshold: number; requiresPrescription?: boolean; schedules: Array<{ id: string; frequency: string; times: string[]; doseAmount: string; startDate: Date; endDate?: Date | null }>; logs: Array<{ takenAt: Date; doseTaken?: string | null; skipped: boolean; scheduleId: string }>; prescriptions: Array<{ quantity: number | null; repeats: number; repeatsUsed: number; expiryDate: Date | null }> }
const days = (a: Date, b: Date) => Math.max(0, Math.ceil((b.getTime() - a.getTime()) / 86400000))
const perDay = (f: string, times: string[]) => {
  if (f === 'twice_daily') return 2
  if (f === 'three_times_daily') return 3
  if (f === 'weekly') return 1 / 7
  if (f === 'custom') return Math.max(1, times.length)
  return 1
}
export function forecastRefill(input: ForecastInput) {
  const horizon = new Date(input.now.getTime() + 14 * 86400000)
  let scheduled14 = 0
  for (const s of input.schedules) {
    if (s.frequency === 'as_needed') continue
    const start = s.startDate > input.now ? s.startDate : input.now
    const end = s.endDate && s.endDate < horizon ? s.endDate : horizon
    scheduled14 += days(start, end) * perDay(s.frequency, s.times) * (Number.parseFloat(s.doseAmount) || 1)
  }
  const prnSchedules = new Set(input.schedules.filter(s => s.frequency === 'as_needed').map(s => s.id))
  const prnRecorded = input.logs
    .filter(l => !l.skipped && prnSchedules.has(l.scheduleId) && l.takenAt >= new Date(input.now.getTime() - 14 * 86400000) && l.takenAt < input.now)
    .reduce((n, l) => n + (Number.parseFloat(String(l.doseTaken || 1)) || 1), 0)
  const availableFills = input.prescriptions.filter(p => !p.expiryDate || p.expiryDate >= input.now).reduce((n, p) => n + Math.max(0, p.repeats + 1 - p.repeatsUsed), 0)
  const quantityPerFill = input.prescriptions.find(p => p.quantity != null)?.quantity || 0
  // Recent recorded PRN use is a useful planning signal, but it is not treated
  // as a certainty. The uncertainty flag and explanation are returned with it.
  const projected = input.stock - scheduled14 - prnRecorded
  const daily = (scheduled14 + prnRecorded) / 14
  const daysUntilEmpty = daily > 0 ? Math.max(0, Math.floor(input.stock / daily)) : null
  const refillDate = daysUntilEmpty == null ? null : new Date(input.now.getTime() + daysUntilEmpty * 86400000)
  const scriptSupplyWarning = Boolean(input.requiresPrescription && availableFills === 0)
  return { scheduled14, prnRecorded, projected, availableFills, availableSupply: availableFills * quantityPerFill, refillDate, scriptSupplyWarning, uncertain: input.schedules.some(s => s.frequency === 'as_needed'), due: scriptSupplyWarning || projected <= input.reorderThreshold || (refillDate != null && refillDate <= horizon) }
}
export function fortnightStart(value: Date) {
  const d = new Date(value)
  d.setHours(0, 0, 0, 0)
  const anchor = new Date(d.getFullYear(), 0, 1)
  const elapsedDays = Math.floor((d.getTime() - anchor.getTime()) / 86400000)
  const start = new Date(anchor)
  start.setDate(start.getDate() + Math.floor(elapsedDays / 14) * 14)
  return start
}