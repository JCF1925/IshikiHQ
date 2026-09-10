import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeUnitPrice, compareUnitPrices, evaluatePriceTarget, buildPriceWatchDto, buildObservationDto } from '../lib/price-watch'
import { priceObservationCreateSchema } from '../lib/validation'

test('normalises Australian prices with shipping from observation pack', () => {
  const a = normalizeUnitPrice(6, 750, 'g', 1)
  const b = normalizeUnitPrice(8, 1, 'kg', 0)
  assert.equal(a.comparable, true)
  assert.ok(a.value !== undefined)
  assert.ok(Math.abs(a.value - 0.9333333333333333) < 1e-12)
  assert.equal(compareUnitPrices(a, b).comparable, true)
})

test('explains incompatible dimensions', () => {
  const mass = normalizeUnitPrice(4, 500, 'g')
  const count = normalizeUnitPrice(4, 6, 'count')
  const result = compareUnitPrices(mass, count)
  assert.equal(result.comparable, false)
  assert.match(result.explanation, /different dimensions/)
})

test('observation validation is blank-safe for optional values', () => {
  const result = priceObservationCreateSchema.safeParse({
    price: '5.50', packQuantity: '750', packUnit: 'g', shippingCost: '',
    observedAt: '2026-01-01T00:00:00Z', sourceUrl: '', membershipAssumption: '',
  })
  assert.equal(result.success, true)
  if (result.success) assert.equal(result.data.shippingCost, 0)
})

test('target evaluation normalises different pack sizes and shipping', () => {
  assert.equal(evaluatePriceTarget(10, 1, 'kg', 6, 750, 'g', 1).status, 'met')
  assert.equal(evaluatePriceTarget(10, 1, 'kg', 8, 750, 'g', 1).status, 'above')
  const incompatible = evaluatePriceTarget(10, 1, 'kg', 5, 6, 'count', 0)
  assert.equal(incompatible.status, 'uncomparable')
  assert.match(incompatible.explanation, /different dimensions/)
})

test('DTO builders exclude UI-only identifiers and reject invalid dates', () => {
  const watch = buildPriceWatchDto({ productName: ' Beans ', packQuantity: '750', packUnit: 'g', preferredRetailers: 'Coles', targetPrice: '5', checkCadence: 'weekly', status: 'active' })
  assert.equal('id' in watch, false)
  const observation = buildObservationDto({ price: '5', packQuantity: '750', packUnit: 'g', shippingCost: '', observedAt: '2026-01-01T10:00', sourceUrl: '', membershipAssumption: '', notes: '' })
  assert.equal('watchId' in observation, false)
  assert.throws(() => buildObservationDto({ price: '5', packQuantity: '1', packUnit: 'count', shippingCost: '', observedAt: 'bad', sourceUrl: '', membershipAssumption: '', notes: '' }))
})