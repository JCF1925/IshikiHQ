import type { MedicareClaimData, PrivateHealthClaimData } from './health-claims'

type HealthClaimAuditField = keyof MedicareClaimData | keyof PrivateHealthClaimData

export const HEALTH_IMPORT_AUDIT_FIELD_LABELS = {
  serviceDate: 'Service date',
  description: 'Description',
  itemNumber: 'Item number',
  provider: 'Provider',
  scheduleFee: 'Schedule fee',
  feeCharged: 'Charged amount',
  benefitPaid: 'Benefit paid',
  outOfPocket: 'Out-of-pocket',
  financialYear: 'Financial year',
  isForecast: 'Forecast',
  countsToSafetyNet: 'Safety net',
  appointmentId: 'Linked appointment',
  claimNumber: 'Claim number',
  serviceType: 'Service type',
  chargedAmount: 'Charged amount',
  benefitAmount: 'Benefit amount',
  benefitDetail: 'Benefit detail',
  claimStatus: 'Claim status',
} satisfies Record<HealthClaimAuditField, string>

export function healthImportAuditFieldLabels(fields: string[] | null): string[] {
  if (!Array.isArray(fields)) return []
  return Array.from(new Set(fields.map((field) => (
    Object.prototype.hasOwnProperty.call(HEALTH_IMPORT_AUDIT_FIELD_LABELS, field)
      ? HEALTH_IMPORT_AUDIT_FIELD_LABELS[field as HealthClaimAuditField]
      : 'Claim field'
  ))))
}