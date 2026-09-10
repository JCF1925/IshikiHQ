import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  annualise,
  helpRepayment,
  incomeTax,
  medicareLevy,
  splitSuper,
  taxBreakdown,
} from '../lib/tax.ts'

describe('Australian tax baseline', () => {
  it('calculates resident income tax at bracket boundaries', () => {
    assert.equal(incomeTax(18_200), 0)
    assert.equal(incomeTax(45_000), 4_020)
    assert.equal(incomeTax(60_000), 8_520)
    assert.equal(incomeTax(-1), 0)
  })

  it('applies Medicare low-income shade-in deterministically', () => {
    assert.equal(medicareLevy(27_222), 0)
    assert.equal(medicareLevy(30_000), 277.8)
    assert.equal(medicareLevy(34_027), 680.5)
    assert.equal(medicareLevy(34_028), 680.56)
  })

  it('calculates marginal HELP repayments and the top flat rate', () => {
    assert.equal(helpRepayment(67_000), 0)
    assert.equal(helpRepayment(100_000), 4_950)
    assert.equal(helpRepayment(125_000), 8_700)
    assert.equal(helpRepayment(200_000), 20_000)
  })

  it('keeps salary and tax breakdown conversions reproducible', () => {
    assert.equal(annualise(2_000, 'fortnightly'), 52_000)
    assert.deepEqual(splitSuper(112_000, 12, true), { base: 100_000, sg: 12_000, totalPackage: 112_000 })
    assert.deepEqual(taxBreakdown(60_000), {
      taxable: 60_000, incomeTax: 8_520, medicare: 1_200, totalTax: 9_720,
      net: 50_280, averageRate: 0.162, marginalRate: 0.3,
    })
  })
})