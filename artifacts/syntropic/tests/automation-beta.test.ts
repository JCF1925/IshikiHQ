import assert from 'node:assert/strict'
import test from 'node:test'
import {
  REDBARK_REQUIRED_GATES,
  aggregateSnapshotKey,
  assertRedbarkGates,
  categoryConfidence,
  classifyForwardedMessage,
  normalizeMerchant,
  nextSyncRetry,
  providerObservationHash,
  preserveUserOverride,
  reconciliationIdentity,
  shouldAutoApplyCategory,
  shouldRevertAutoCategory,
  sourceIdempotencyKey,
  type ProviderTransaction,
} from '../lib/automation-beta'
import { configureRedbarkAdapter, getRedbarkAdapter } from '../lib/redbark-provider'

test('merchant normalization removes payment noise and card references', () => {
  assert.equal(normalizeMerchant('  VISA PURCHASE Woolworths #123456  '), 'woolworths')
  assert.equal(normalizeMerchant('WOOLWORTHS   123456'), 'woolworths')
})

test('confidence learns only from explicitly confirmed evidence', () => {
  const result = categoryConfidence('Woolworths 123456', [
    { category: 'Groceries', explicitlyConfirmed: true, normalizedMerchant: 'woolworths' },
    { category: 'Dining', explicitlyConfirmed: false, normalizedMerchant: 'woolworths' },
    { category: 'Travel', explicitlyConfirmed: true, normalizedMerchant: 'other' },
  ])
  assert.equal(result?.category, 'Groceries')
  assert.equal(result?.evidenceCount, 1)
  assert.equal(categoryConfidence('Unknown', []), null)
})

test('auto allocation obeys user threshold without changing lifecycle semantics', () => {
  assert.equal(shouldAutoApplyCategory(0.9, 0.9), true)
  assert.equal(shouldAutoApplyCategory(0.899, 0.9), false)
  assert.throws(() => shouldAutoApplyCategory(0.9, 1.1))
})

test('Redbark gates fail closed on missing, blank, or expired contract evidence', () => {
  const now = new Date('2026-01-01T00:00:00Z')
  const complete = REDBARK_REQUIRED_GATES.map((gate) => ({
    gate, confirmed: true, contractValue: `contract:${gate}`, confirmedAt: now,
  }))
  assert.doesNotThrow(() => assertRedbarkGates(complete, now))
  assert.throws(() => assertRedbarkGates(complete.slice(1), now), /account_eligibility/)
  assert.throws(() => assertRedbarkGates(complete.map((item) =>
    item.gate === 'pagination' ? { ...item, contractValue: '' } : item), now), /pagination/)
  assert.throws(() => assertRedbarkGates(complete.map((item) =>
    item.gate === 'retention' ? { ...item, expiresAt: new Date('2025-01-01') } : item), now), /retention/)
})

test('provider boundary refuses absent and contract-mismatched adapters', () => {
  const contract = { apiVersion: 'attested-v1', sandbox: true as const, gateValues: {}, credentialReference: 'secret-ref' }
  assert.throws(() => getRedbarkAdapter(contract), /not configured/)
  configureRedbarkAdapter(() => ({
    apiVersion: 'wrong', sandbox: true,
    async listTransactions() { return { transactions: [], nextCursor: null } },
    async verifyWebhook() { return true },
    async parseWebhook() { return [] },
    async revokeConnection() {},
  }))
  assert.throws(() => getRedbarkAdapter(contract), /does not match/)
})

test('source idempotency and pending-to-posted reconciliation identities are stable', () => {
  const pending: ProviderTransaction = {
    providerTransactionId: 'pending-1', reconciliationKey: 'provider-link-1', status: 'pending',
    amount: '-12.50', currency: 'AUD', date: '2026-01-01', merchant: 'Cafe', raw: { original: '-12.50' },
  }
  assert.equal(sourceIdempotencyKey('c', 'a', pending), sourceIdempotencyKey('c', 'a', { ...pending }))
  assert.equal(sourceIdempotencyKey('c', 'a', pending), sourceIdempotencyKey('c', 'a', {
    ...pending, status: 'posted', amount: '-13.00', date: '2026-01-03', raw: { changed: true },
  }))
  assert.notEqual(providerObservationHash(pending), providerObservationHash({ ...pending, amount: '-13.00', raw: { changed: true } }))
  assert.equal(reconciliationIdentity(pending), reconciliationIdentity({ ...pending, providerTransactionId: 'posted-9', status: 'posted' }))
  assert.equal(preserveUserOverride('user edit', 'pending provider', 'posted provider'), 'user edit')
  assert.equal(preserveUserOverride('pending provider', 'pending provider', 'posted provider'), 'posted provider')
  assert.equal(shouldRevertAutoCategory(true, 'Groceries', 'Groceries'), true)
  assert.equal(shouldRevertAutoCategory(true, 'Dining', 'Groceries'), false)
})

test('sync retry backoff is bounded by dead-letter threshold', () => {
  const first = nextSyncRetry(1, 3, 0)
  assert.equal(first.status, 'retrying')
  assert.equal(first.nextRetryAt?.getTime(), 60_000)
  const final = nextSyncRetry(3, 3, 0)
  assert.equal(final.status, 'dead_letter')
  assert.equal(final.nextRetryAt, null)
})

test('aggregate identity is deterministic and forwarded ingestion is explicit/minimal', () => {
  const start = new Date('2026-01-01T00:00:00Z')
  const end = new Date('2026-02-01T00:00:00Z')
  assert.equal(aggregateSnapshotKey('merchant', 'cafe', start, end), aggregateSnapshotKey('merchant', 'cafe', start, end))
  assert.throws(() => classifyForwardedMessage({ explicitlyForwarded: false, messageId: 'x', text: 'bill' } as any), /explicit/)
  const candidate = classifyForwardedMessage({
    explicitlyForwarded: true, messageId: 'message-1', from: 'sender@example.com',
    subject: 'Your receipt', text: 'Tax invoice $12.00 dated 01/01/2026',
  })
  assert.equal(candidate?.kind, 'receipt')
  assert.deepEqual(Object.keys(candidate?.minimumData ?? {}).sort(), ['hasAmount', 'hasDate', 'subject'])
})