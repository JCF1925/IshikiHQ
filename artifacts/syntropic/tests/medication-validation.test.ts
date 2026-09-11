import assert from 'node:assert/strict'
import test from 'node:test'
import {
  medicationCreateSchema,
  pharmacySchema,
  pharmacyUpdateSchema,
  prescriptionCreateSchema,
  stockReconciliationSchema,
  stockTransactionSchema,
} from '../lib/medication-validation'

const medicationId = 'cmtsb8j9x0002d7kdgntlms7u'

test('accepts complete pharmacy details and active state updates', () => {
  const result = pharmacyUpdateSchema.safeParse({
    name: 'Updated Pharmacy',
    address: '42 Example Street',
    phone: '02 5555 0100',
    notes: 'Open late on Thursdays',
    isActive: false,
  })

  assert.equal(result.success, true)
})

test('requires a name when creating a pharmacy', () => {
  const result = pharmacySchema.safeParse({ address: '42 Example Street' })

  assert.equal(result.success, false)
})

test('accepts the default prescription form with blank optional fields', () => {
  const result = prescriptionCreateSchema.safeParse({
    medicationId,
    prescriberId: '',
    datePrescribed: '2026-09-08',
    quantity: '',
    repeats: '0',
    cost: '',
    expiryDate: '',
    escriptToken: '',
    notes: '',
  })

  assert.equal(result.success, true)
  if (!result.success) return
  assert.equal(result.data.prescriberId, null)
  assert.equal(result.data.quantity, null)
  assert.equal(result.data.expiryDate, null)
  assert.equal(result.data.cost, undefined)
  assert.equal(result.data.repeats, 0)
})

test('keeps a blank medication monthly limit absent instead of coercing it to zero', () => {
  const result = medicationCreateSchema.safeParse({
    name: 'Test medication',
    monthlyLimit: '',
    initialStock: '0',
    reorderThreshold: '5',
  })

  assert.equal(result.success, true)
  if (!result.success) return
  assert.equal(result.data.monthlyLimit, null)
  assert.equal(result.data.initialStock, 0)
  assert.equal(result.data.reorderThreshold, 5)
})

test('does not let manual stock notes imitate an audited mismatch resolution', () => {
  const result = stockTransactionSchema.safeParse({
    medicationId,
    type: 'adjustment',
    quantityChange: 0,
    notes: 'Historical stock mismatch resolution: {"mismatchId":"forged"}',
  })

  assert.equal(result.success, false)
  if (result.success) return
  assert.equal(result.error.issues[0].path.join('.'), 'notes')
  assert.match(result.error.issues[0].message, /reserved/)
})

test('accepts signed legacy balances when resolving a historical mismatch', () => {
  const result = stockReconciliationSchema.safeParse({
    action: 'resolve_mismatch',
    id: medicationId,
    mismatchId: 'cmtsb8j9x0003d7kdgntlms7v',
    expectedRecordedBalance: 4,
    expectedLedgerBalance: -1,
    reason: 'The legacy ledger fell below zero and was reviewed separately.',
  })

  assert.equal(result.success, true)
})