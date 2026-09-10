// Shared recurrence helpers for the recurring-transaction & BNPL engines.
// All date math is UTC-based to stay deterministic across server/client.

export type Frequency = 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'annually'

function setUtcMonthClamped(date: Date, months: number): void {
  const day = date.getUTCDate()
  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
  date.setUTCDate(Math.min(day, lastDay))
}

/** Advance a date by one recurrence step (frequency x interval). Returns a new Date. */
export function advance(date: Date, frequency: string, interval = 1): Date {
  const d = new Date(date)
  const n = Math.max(1, interval)
  switch (frequency) {
    case 'weekly':
      d.setUTCDate(d.getUTCDate() + 7 * n)
      break
    case 'fortnightly':
      d.setUTCDate(d.getUTCDate() + 14 * n)
      break
    case 'monthly':
      setUtcMonthClamped(d, n)
      break
    case 'quarterly':
      setUtcMonthClamped(d, 3 * n)
      break
    case 'annually':
      setUtcMonthClamped(d, 12 * n)
      break
    default:
      setUtcMonthClamped(d, n)
  }
  return d
}

/**
 * Generate all occurrence dates for a recurring template from `after` (exclusive)
 * up to and including `until`. Walks forward from anchorDate.
 */
export function occurrencesBetween(
  anchorDate: Date,
  frequency: string,
  interval: number,
  after: Date,
  until: Date,
  endDate?: Date | null,
): Date[] {
  const out: Date[] = []
  let cursor = new Date(anchorDate)
  const hardEnd = endDate ? new Date(endDate) : null
  // Fast-forward to just past `after` without emitting historical dates
  let guard = 0
  while (cursor.getTime() <= after.getTime() && guard < 5000) {
    cursor = advance(cursor, frequency, interval)
    guard++
  }
  guard = 0
  while (cursor.getTime() <= until.getTime() && guard < 5000) {
    if (hardEnd && cursor.getTime() > hardEnd.getTime()) break
    out.push(new Date(cursor))
    cursor = advance(cursor, frequency, interval)
    guard++
  }
  return out
}

/** Compute the next occurrence on/after `from` for a template. */
export function nextOccurrence(
  anchorDate: Date,
  frequency: string,
  interval: number,
  from: Date,
  endDate?: Date | null,
): Date | null {
  let cursor = new Date(anchorDate)
  const hardEnd = endDate ? new Date(endDate) : null
  let guard = 0
  while (cursor.getTime() < from.getTime() && guard < 5000) {
    cursor = advance(cursor, frequency, interval)
    guard++
  }
  if (hardEnd && cursor.getTime() > hardEnd.getTime()) return null
  return cursor
}

/** Generate a small, deterministic schedule window. Callers should upsert by
 * cycle + start date so retries and concurrent requests cannot duplicate rows. */
export function payPeriodDates(
  firstPayDate: Date,
  frequency: 'fortnightly' | 'monthly',
  through: Date,
  endDate?: Date | null,
  maxPeriods = 8,
): Array<{ startDate: Date; endDate: Date; payDate: Date }> {
  const out: Array<{ startDate: Date; endDate: Date; payDate: Date }> = []
  let pay = new Date(firstPayDate)
  let guard = 0
  const windowStart = new Date(through)
  windowStart.setUTCDate(windowStart.getUTCDate() - 60)
  while (pay < windowStart && guard++ < 5000) pay = advance(pay, frequency, 1)
  guard = 0
  while (pay <= through && guard++ < Math.min(12, Math.max(1, maxPeriods))) {
    if (endDate && pay > endDate) break
    const previous = new Date(pay)
    if (frequency === 'monthly') {
      const day = previous.getUTCDate()
      previous.setUTCDate(1)
      previous.setUTCMonth(previous.getUTCMonth() - 1)
      const last = new Date(Date.UTC(previous.getUTCFullYear(), previous.getUTCMonth() + 1, 0)).getUTCDate()
      previous.setUTCDate(Math.min(day, last))
    }
    if (frequency === 'fortnightly') previous.setUTCDate(previous.getUTCDate() - 13)
    out.push({ startDate: previous, endDate: new Date(pay), payDate: new Date(pay) })
    pay = advance(pay, frequency, 1)
  }
  return out
}

/** Number of days between two dates (approx, for period grouping). */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

/** Provider presets for BNPL plans. */
export const BNPL_PRESETS: Record<string, { numInstalments: number; frequency: string; fixed: boolean }> = {
  Afterpay: { numInstalments: 4, frequency: 'fortnightly', fixed: true },
  Klarna: { numInstalments: 4, frequency: 'fortnightly', fixed: true },
  Zip: { numInstalments: 4, frequency: 'fortnightly', fixed: false },
  Humm: { numInstalments: 5, frequency: 'fortnightly', fixed: false },
  PayPal: { numInstalments: 4, frequency: 'fortnightly', fixed: true },
  Other: { numInstalments: 4, frequency: 'fortnightly', fixed: false },
}
