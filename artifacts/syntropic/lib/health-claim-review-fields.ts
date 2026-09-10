export type HealthClaimReviewInputType = 'date' | 'number' | 'text'

export type HealthClaimReviewField<Field extends string = string> = {
  field: Field
  label: string
  inputType: HealthClaimReviewInputType
}

export const MEDICARE_REVIEW_FIELDS = [
  { field: 'serviceDate', label: 'Service date', inputType: 'date' },
  { field: 'description', label: 'Description', inputType: 'text' },
  { field: 'provider', label: 'Provider', inputType: 'text' },
  { field: 'itemNumber', label: 'Item number', inputType: 'text' },
  { field: 'feeCharged', label: 'Charged', inputType: 'number' },
  { field: 'benefitPaid', label: 'Benefit', inputType: 'number' },
  { field: 'outOfPocket', label: 'Out-of-pocket', inputType: 'number' },
] as const satisfies readonly HealthClaimReviewField[]

export const PRIVATE_HEALTH_REVIEW_FIELDS = [
  { field: 'serviceDate', label: 'Service date', inputType: 'date' },
  { field: 'description', label: 'Description', inputType: 'text' },
  { field: 'provider', label: 'Provider', inputType: 'text' },
  { field: 'claimNumber', label: 'Claim number', inputType: 'text' },
  { field: 'chargedAmount', label: 'Charged', inputType: 'number' },
  { field: 'benefitAmount', label: 'Benefit', inputType: 'number' },
  { field: 'outOfPocket', label: 'Out-of-pocket', inputType: 'number' },
] as const satisfies readonly HealthClaimReviewField[]