import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { deriveDebtBalance, debtPreviewToken, previewSimpleInterest, validateTransactionAllocations } from '@/lib/interpersonal-debt'

describe('interpersonal debt ledger', () => {
  it('derives balance only from movement semantics', () => {
    assert.equal(deriveDebtBalance([
      { type: 'principal_advance', amount: '100.00' },
      { type: 'repayment', amount: 25 },
      { type: 'adjustment', amount: 2.5 },
    ]), 77.5)
    assert.equal(deriveDebtBalance([{ type: 'principal_advance', amount: 100 }], 'owed_by_me'), -100)
  })
  it('rejects allocations that alter or exceed the source transaction', () => {
    assert.equal(validateTransactionAllocations(-100, [{ amount: 40 }, { amount: 60 }]), 100)
    assert.throws(() => validateTransactionAllocations(100, [{ amount: 101 }]))
  })
  it('requires an unchanged preview token for confirmation', () => {
    process.env.SESSION_SECRET = 'deterministic-test-secret'
    const from = new Date('2026-01-01T00:00:00Z'); const through = new Date('2026-04-01T00:00:00Z')
    const preview = previewSimpleInterest({ balance: 1200, annualRate: 12, from, through })
    const token = debtPreviewToken('a', [{ type: 'principal_advance', amount: 1200 }], preview)
    assert.equal(token, debtPreviewToken('a', [{ type: 'principal_advance', amount: 1200 }], preview))
    assert.notEqual(token, debtPreviewToken('a', [{ type: 'principal_advance', amount: 1100 }], preview))
  })
})