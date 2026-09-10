// Pure, client-safe health helpers (Australian Medicare context)
// Threshold values are indicative for personal planning and are user-adjustable in the UI.
// Reference: Medicare Safety Net thresholds (indexed annually).

export const OMSN_THRESHOLD = 576.0 // Original Medicare Safety Net (gap amount, per calendar year)
export const EMSN_GENERAL_THRESHOLD = 2615.5 // Extended Medicare Safety Net – general
export const EMSN_CONCESSION_THRESHOLD = 811.8 // Extended Medicare Safety Net – concession/FTB

export function calendarYearOf(d: Date | string): number {
  return new Date(d).getUTCFullYear()
}

export interface SafetyNetProgress {
  year: number
  gapTotal: number // counts toward OMSN
  outOfPocketTotal: number // counts toward EMSN
  omsnThreshold: number
  emsnThreshold: number
  omsnMet: boolean
  emsnMet: boolean
  omsnRemaining: number
  emsnRemaining: number
  omsnPct: number
  emsnPct: number
}

export function safetyNetProgress(
  gapTotal: number,
  outOfPocketTotal: number,
  year: number,
  opts?: { concession?: boolean; omsnThreshold?: number; emsnThreshold?: number }
): SafetyNetProgress {
  const omsnThreshold = opts?.omsnThreshold ?? OMSN_THRESHOLD
  const emsnThreshold = opts?.emsnThreshold ?? (opts?.concession ? EMSN_CONCESSION_THRESHOLD : EMSN_GENERAL_THRESHOLD)
  return {
    year,
    gapTotal,
    outOfPocketTotal,
    omsnThreshold,
    emsnThreshold,
    omsnMet: gapTotal >= omsnThreshold,
    emsnMet: outOfPocketTotal >= emsnThreshold,
    omsnRemaining: Math.max(0, omsnThreshold - gapTotal),
    emsnRemaining: Math.max(0, emsnThreshold - outOfPocketTotal),
    omsnPct: omsnThreshold > 0 ? Math.min(100, (gapTotal / omsnThreshold) * 100) : 0,
    emsnPct: emsnThreshold > 0 ? Math.min(100, (outOfPocketTotal / emsnThreshold) * 100) : 0,
  }
}
