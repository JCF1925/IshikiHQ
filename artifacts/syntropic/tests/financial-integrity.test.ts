import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  deriveAccountBalances,
  isOwnedBy,
  isTransactionLocked,
  normaliseImportedTransaction,
  TRANSACTION_LOCK_MS,
} from '../lib/financial-integrity.ts'

describe('financial data integrity baseline', () => {
  it('derives balances only from transactions owned by an account owner', () => {
    const balances = deriveAccountBalances(
      [{ id: 'a', userId: 'u1', openingBalance: 100 }, { id: 'b', userId: 'u2', openingBalance: 5 }],
      [
        { userId: 'u1', accountId: 'a', amount: 12.345 },
        { userId: 'u2', accountId: 'a', amount: 999 },
        { userId: 'u2', accountId: 'b', amount: -2 },
        { userId: 'u1', accountId: 'missing', amount: 10 },
      ],
    )
    assert.deepEqual([...balances.entries()], [['a', 112.35], ['b', 3]])
  })

  it('locks confirmed transactions strictly after sixty days unless manually unlocked', () => {
    const now = new Date('2025-04-01T00:00:00.000Z')
    const atBoundary = new Date(now.getTime() - TRANSACTION_LOCK_MS)
    assert.equal(isTransactionLocked({ status: 'confirmed', confirmedAt: atBoundary }, now), false)
    assert.equal(isTransactionLocked({ status: 'confirmed', confirmedAt: new Date(atBoundary.getTime() - 1) }, now), true)
    assert.equal(isTransactionLocked({ status: 'confirmed', confirmedAt: new Date(atBoundary.getTime() - 1), manuallyUnlocked: true }, now), false)
  })

  it('normalises valid imports and rejects incomplete or invalid values', () => {
    const imported = normaliseImportedTransaction(
      { booked: '2025-02-01', debit: '$1,234.567', payee: ' Grocer ' },
      { date: 'booked', amount: 'debit', merchant: 'payee' },
    )
    assert.equal(imported.date.toISOString(), '2025-02-01T00:00:00.000Z')
    assert.deepEqual({ ...imported, date: undefined }, { date: undefined, amount: 1234.57, merchant: 'Grocer', description: null, category: null })
    assert.throws(() => normaliseImportedTransaction({ date: '2025-02-01' }), /missing date or amount/)
    assert.throws(() => normaliseImportedTransaction({ date: '2025-02-01', amount: 'abc' }), /invalid amount/)
  })

  it('fails ownership checks closed', () => {
    assert.equal(isOwnedBy({ userId: 'u1' }, 'u1'), true)
    assert.equal(isOwnedBy({ userId: 'u1' }, 'u2'), false)
    assert.equal(isOwnedBy(undefined, 'u1'), false)
  })
})