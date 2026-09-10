export type ReferralValidityType = 'six_months' | 'twelve_months' | 'indefinite' | 'custom'
export type ReferralServiceLimitPeriod = 'calendar_year' | 'rolling_twelve_months'

export type ReferralLike = {
  issueDate: Date | string
  expiryDate: Date | string | null
  validityType: string
  appointmentLimit: number | null
  serviceLimitPeriod: string | null
  isActive: boolean
  practitionerId: string
}

export type ReferralUsageLike = {
  serviceDate: Date | string
  status: string
}

export type ReferralEvaluation = {
  code: 'not_required' | 'valid' | 'missing' | 'inactive' | 'wrong_practitioner' | 'not_yet_valid' | 'expired' | 'exhausted'
  message: string
  eligible: boolean
  remaining: number | null
  expiryDate: Date | string | null
  renewalReminderEligible: boolean
  renewalReminder: boolean
  usageCount: number
}

const DAY = 24 * 60 * 60 * 1000
const RENEWAL_REMINDER_DAYS = 30

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}

function dayStart(value: Date | string): Date {
  const date = asDate(value)
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

export function calculateReferralExpiry(
  issueDate: Date | string,
  validityType: string,
  customExpiryDate: Date | string | null,
): Date | null {
  const issue = dayStart(issueDate)
  if (validityType === 'indefinite') return null
  if (validityType === 'custom') return customExpiryDate ? dayStart(customExpiryDate) : null
  const months = validityType === 'six_months' ? 6 : validityType === 'twelve_months' ? 12 : null
  if (!months) return customExpiryDate ? dayStart(customExpiryDate) : null
  const expiry = new Date(Date.UTC(issue.getUTCFullYear(), issue.getUTCMonth() + months + 1, 0))
  return expiry
}

function inServiceWindow(serviceDate: Date, usageDate: Date, period: string | null): boolean {
  if (period === 'calendar_year') return serviceDate.getUTCFullYear() === usageDate.getUTCFullYear()
  if (period === 'rolling_twelve_months') {
    const start = new Date(serviceDate)
    start.setUTCFullYear(start.getUTCFullYear() - 1)
    return usageDate >= start && usageDate <= serviceDate
  }
  return true
}

export function evaluateReferral(
  referral: ReferralLike | null | undefined,
  practitionerRequired: boolean,
  appointmentDate: Date | string,
  practitionerId?: string | null,
  usages: ReferralUsageLike[] = [],
  now: Date = new Date(),
): ReferralEvaluation {
  if (!practitionerRequired && !referral) {
    return { code: 'not_required', message: 'No referral is required for this practitioner.', eligible: true, remaining: null, expiryDate: null, renewalReminderEligible: false, renewalReminder: false, usageCount: 0 }
  }
  if (!referral) {
    return { code: 'missing', message: 'A valid referral is required before a Medicare rebate can be payable.', eligible: false, remaining: null, expiryDate: null, renewalReminderEligible: false, renewalReminder: false, usageCount: 0 }
  }

  const issueDate = dayStart(referral.issueDate)
  const serviceDate = dayStart(appointmentDate)
  const expiryDate = calculateReferralExpiry(referral.issueDate, referral.validityType, referral.expiryDate)
  const activeUsages = usages.filter((usage) => usage.status === 'counted')
  const usageCount = activeUsages.filter((usage) => inServiceWindow(serviceDate, dayStart(usage.serviceDate), referral.serviceLimitPeriod)).length
  const remaining = referral.appointmentLimit == null ? null : Math.max(0, referral.appointmentLimit - usageCount)
  const renewalReminderEligible = referral.isActive && Boolean(expiryDate || referral.appointmentLimit != null)
  const reminderByDate = expiryDate ? expiryDate.getTime() - dayStart(now).getTime() <= RENEWAL_REMINDER_DAYS * DAY && expiryDate >= dayStart(now) : false
  const reminderByLimit = remaining != null && remaining <= 1
  const base = { remaining, expiryDate, renewalReminderEligible, renewalReminder: renewalReminderEligible && (reminderByDate || reminderByLimit), usageCount }

  if (!referral.isActive) return { ...base, code: 'inactive', message: 'This referral is inactive.', eligible: false }
  if (practitionerId && referral.practitionerId !== practitionerId) return { ...base, code: 'wrong_practitioner', message: 'This referral is for a different practitioner.', eligible: false }
  if (serviceDate < issueDate) return { ...base, code: 'not_yet_valid', message: 'This appointment is before the referral issue date.', eligible: false }
  if (expiryDate && serviceDate > expiryDate) return { ...base, code: 'expired', message: 'This referral has expired.', eligible: false }
  if (remaining === 0) return { ...base, code: 'exhausted', message: 'This referral has no services remaining in the configured period.', eligible: false }
  return { ...base, code: 'valid', message: 'Referral conditions are met for this appointment.', eligible: true }
}

export function referralStatusLabel(code: ReferralEvaluation['code']): string {
  return {
    not_required: 'Referral not required',
    valid: 'Referral valid',
    missing: 'Referral required',
    inactive: 'Referral inactive',
    wrong_practitioner: 'Wrong practitioner',
    not_yet_valid: 'Not yet valid',
    expired: 'Referral expired',
    exhausted: 'Services exhausted',
  }[code]
}