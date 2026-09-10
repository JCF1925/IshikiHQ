export const EVIDENCE_WARNING_DAYS = 14
export const EVIDENCE_VALIDITY_DAYS = 90
/**
 * The scheduler runs daily, but evidence reminders are intentionally sparse.
 * Keeping this as calendar offsets from the derived deadline avoids storing
 * receiver or user data just to deduplicate repeated scheduler runs.
 */
export const EVIDENCE_REMINDER_CADENCE_DAYS = [14, 7, 1] as const

export type EvidenceStatus = 'pass' | 'fail'

export type OperationsEvidence = {
  evidenceType: 'quarterly_restore' | 'alert_acknowledgement'
  evidenceDate: string
  status: EvidenceStatus
  operationalRole: string
}

export type EvidenceAssessment = OperationsEvidence & {
  dueDate: string
  daysRemaining: number
  shouldRemind: boolean
  isReleaseBlocker: boolean
  blockerReason?: string
}

export function parseUtcDate(value: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must be an ISO UTC date (YYYY-MM-DD)`)
  }

  const epoch = Date.UTC(
    Number(value.slice(0, 4)),
    Number(value.slice(5, 7)) - 1,
    Number(value.slice(8, 10)),
  )
  const date = new Date(epoch)
  if (date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} must be a valid UTC date`)
  }
  return date
}

export function addUtcDays(date: Date, days: number) {
  const result = new Date(date.getTime())
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

export function formatUtcDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

export function assessOperationsEvidence(
  evidence: OperationsEvidence,
  checkDate: string,
  warningDays = EVIDENCE_WARNING_DAYS,
): EvidenceAssessment {
  const evidenceDate = parseUtcDate(evidence.evidenceDate, `${evidence.evidenceType} evidence date`)
  const checkedOn = parseUtcDate(checkDate, 'OPS_EVIDENCE_CHECK_DATE')
  const dueDate = addUtcDays(evidenceDate, EVIDENCE_VALIDITY_DAYS)
  const daysRemaining = Math.floor(
    (dueDate.getTime() - checkedOn.getTime()) / 86_400_000,
  )

  let blockerReason: string | undefined
  if (!evidence.operationalRole.trim() || /[\r\n]/.test(evidence.operationalRole)) {
    blockerReason = `${evidence.evidenceType} operational role must be a single named operational role`
  } else if (evidenceDate.getTime() > checkedOn.getTime()) {
    blockerReason = `${evidence.evidenceType} evidence date cannot be in the future`
  } else if (evidence.status !== 'pass') {
    blockerReason = `${evidence.evidenceType} evidence is not marked pass; remediate it before release`
  } else if (daysRemaining <= 0) {
    blockerReason = `${evidence.evidenceType} evidence is overdue; complete a new quarterly check before release`
  }

  return {
    ...evidence,
    dueDate: formatUtcDate(dueDate),
    daysRemaining,
    shouldRemind: blockerReason === undefined
      && daysRemaining > 0
      && daysRemaining <= warningDays
      && EVIDENCE_REMINDER_CADENCE_DAYS.includes(
        daysRemaining as (typeof EVIDENCE_REMINDER_CADENCE_DAYS)[number],
      ),
    isReleaseBlocker: blockerReason !== undefined,
    ...(blockerReason ? { blockerReason } : {}),
  }
}