import assert from 'node:assert/strict'
import test from 'node:test'
import { medicationCreateSchema, prescriptionCreateSchema } from '../lib/medication-validation'

const medicationId = 'cmtsb8j9x0002d7kdgntlms7u'

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