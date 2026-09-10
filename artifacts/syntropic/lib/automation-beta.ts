import { createHash } from 'node:crypto'

export const REDBARK_REQUIRED_GATES = [
  'account_eligibility',
  'sandbox_test_data',
  'api_version',
  'consent_lifecycle',
  'rate_limits',
  'pagination',
  'webhook_signature',
  'retention',
  'deletion',
  'outage_behaviour',
] as const

export type GateAttestation = {
  gate: string
  confirmed: boolean
  contractValue?: string | null
  confirmedAt?: Date | null
  expiresAt?: Date | null
}

export function assertRedbarkGates(attestations: GateAttestation[], now = new Date()) {
  const byGate = new Map(attestations.map((item) => [item.gate, item]))
  const missing = REDBARK_REQUIRED_GATES.filter((gate) => {
    const item = byGate.get(gate)
    return !item?.confirmed || !item.contractValue?.trim() || !item.confirmedAt ||
      Boolean(item.expiresAt && item.expiresAt <= now)
  })
  if (missing.length) throw new Error(`Redbark is fail-closed; unconfirmed gates: ${missing.join(', ')}`)
}

/** Stable merchant identity without retaining card suffixes or noisy processor text. */
export function normalizeMerchant(value?: string | null) {
  if (!value) return ''
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/\b(?:visa|mastercard|debit|credit|eftpos|purchase|pending|pos)\b/g, ' ')
    .replace(/\b(?:ref|card|txn)\s*#?\s*\d+\b/g, ' ')
    .replace(/\b\d{4,}\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export type ConfirmedCategoryEvidence = {
  category: string
  explicitlyConfirmed: boolean
  normalizedMerchant: string
}

export function categoryConfidence(merchant: string, history: ConfirmedCategoryEvidence[]) {
  const normalizedMerchant = normalizeMerchant(merchant)
  const eligible = history.filter((item) =>
    item.explicitlyConfirmed && item.normalizedMerchant === normalizedMerchant && item.category.trim())
  if (!normalizedMerchant || !eligible.length) return null
  const counts = new Map<string, number>()
  for (const item of eligible) counts.set(item.category, (counts.get(item.category) ?? 0) + 1)
  const [category, count] = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
  // Evidence volume tempers certainty; disagreement reduces it.
  const agreement = count / eligible.length
  const volume = 1 - Math.exp(-eligible.length / 3)
  const confidence = Math.min(0.99, Math.round(agreement * (0.65 + 0.35 * volume) * 1000) / 1000)
  return { category, confidence, normalizedMerchant, matchingCount: count, evidenceCount: eligible.length }
}

export function shouldAutoApplyCategory(confidence: number, threshold: number) {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw new Error('Threshold must be between 0 and 1')
  return confidence >= threshold
}

export type ProviderTransaction = {
  providerTransactionId: string
  reconciliationKey?: string | null
  status: 'pending' | 'posted'
  amount: string
  currency: string
  date: string
  merchant?: string | null
  description?: string | null
  raw: unknown
}

export function sourceIdempotencyKey(connectionId: string, accountId: string, input: ProviderTransaction) {
  return createHash('sha256').update(JSON.stringify([
    connectionId, accountId, input.providerTransactionId,
  ])).digest('hex')
}

export function providerObservationHash(input: ProviderTransaction) {
  return createHash('sha256').update(JSON.stringify([
    input.status, input.amount, input.currency, input.date, input.merchant ?? null,
    input.description ?? null, input.raw,
  ])).digest('hex')
}

export function reconciliationIdentity(input: ProviderTransaction) {
  // Settlement changes amount/date. Only an explicit provider linkage (or a
  // stable provider transaction identity) is safe for reconciliation.
  return input.reconciliationKey?.trim() || input.providerTransactionId
}

export function preserveUserOverride<T>(currentValue: T, priorProviderValue: T, postedProviderValue: T) {
  return Object.is(currentValue, priorProviderValue) ? postedProviderValue : currentValue
}

export function shouldRevertAutoCategory(autoApplied: boolean, currentCategory: string | null, suggestedCategory: string) {
  return autoApplied && currentCategory === suggestedCategory
}

export function nextSyncRetry(attemptCount: number, maxAttempts: number, now = Date.now()) {
  const deadLetter = attemptCount >= maxAttempts
  return {
    status: deadLetter ? 'dead_letter' as const : 'retrying' as const,
    nextRetryAt: deadLetter ? null : new Date(now + 60_000 * 2 ** Math.max(0, attemptCount - 1)),
  }
}

export function aggregateSnapshotKey(
  dimension: 'period' | 'merchant' | 'category',
  value: string,
  periodStart: Date,
  periodEnd: Date,
) {
  return `${dimension}:${value}:${periodStart.toISOString()}:${periodEnd.toISOString()}`
}

export type ForwardedPayload = {
  explicitlyForwarded: true
  messageId: string
  from?: string
  subject?: string
  text: string
}

export function classifyForwardedMessage(payload: ForwardedPayload) {
  if (payload.explicitlyForwarded !== true) throw new Error('Only explicit user-forwarded messages are accepted')
  const text = `${payload.subject ?? ''} ${payload.text}`.toLowerCase()
  const candidates = [
    { kind: 'bnpl', pattern: /\b(afterpay|zip pay|buy now pay later|bnpl|instalment)\b/, action: 'review_bnpl_plan' },
    { kind: 'subscription', pattern: /\b(subscription|renews?|membership|recurring)\b/, action: 'review_subscription' },
    { kind: 'appointment', pattern: /\b(appointment|booking|consultation)\b/, action: 'review_appointment' },
    { kind: 'receipt', pattern: /\b(receipt|tax invoice|order confirmation)\b/, action: 'review_receipt' },
    { kind: 'bill', pattern: /\b(bill|invoice|amount due|due date)\b/, action: 'review_bill' },
  ] as const
  const match = candidates.find((candidate) => candidate.pattern.test(text))
  if (!match) return null
  const hasAmount = /(?:aud|\$)\s?\d/.test(text)
  const hasDate = /\b\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?\b/.test(text)
  const confidence = Math.min(0.95, 0.6 + (hasAmount ? 0.15 : 0) + (hasDate ? 0.1 : 0))
  return {
    kind: match.kind,
    title: (payload.subject || `${match.kind} candidate`).slice(0, 300),
    confidence,
    sourceRefs: { messageId: payload.messageId, from: payload.from ?? null },
    minimumData: { subject: payload.subject?.slice(0, 300) ?? null, hasAmount, hasDate },
    proposedAction: { type: match.action },
  }
}