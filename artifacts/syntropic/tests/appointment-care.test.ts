import assert from 'node:assert/strict'
import test from 'node:test'
import { finiteNumber, jsonField, optionalDate } from '../lib/appointment-care'

test('appointment care numeric fields reject non-finite values and preserve blanks', () => {
  assert.equal(finiteNumber('', 'cost'), null)
  assert.equal(finiteNumber('42.50', 'cost'), 42.5)
  assert.throws(() => finiteNumber('not-a-number', 'cost'), /cost must be a finite number/)
})

test('appointment care dates reject invalid input while allowing omitted dates', () => {
  assert.equal(optionalDate('', 'startsAt'), null)
  assert.equal(optionalDate('2026-09-09T10:00:00Z', 'startsAt')?.toISOString(), '2026-09-09T10:00:00.000Z')
  assert.throws(() => optionalDate('not-a-date', 'startsAt'), /startsAt must be a valid date/)
})

test('structured outcome fields accept arrays and objects only', () => {
  assert.deepEqual(jsonField(['book review'], 'futureTasks'), ['book review'])
  assert.deepEqual(jsonField({ status: 'paid' }, 'payment'), { status: 'paid' })
  assert.throws(() => jsonField('paid', 'payment'), /payment must be an object or array/)
})