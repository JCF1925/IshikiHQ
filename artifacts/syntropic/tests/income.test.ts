import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import {
  incomeSourceCreateSchema,
  incomeSourceUpdateSchema,
} from '../lib/validation'
import { payPeriodDates } from '../lib/recurrence'

const validIncome = {
  name: 'Main salary',
  type: 'salary',
  amount: '90000',
  frequency: 'annually',
  hoursPerWeek: '',
  isGross: true,
  incSuper: false,
  superRate: '12',
  startDate: '2026-01-01',
  endDate: '',
  isActive: true,
  notes: '',
  employerId: '',
  payAccountId: '',
}

describe('income contract', () => {
  it('generates bounded, fast-forwarded periods with real monthly intervals', () => {
    const periods = payPeriodDates(new Date('2020-01-31T00:00:00Z'), 'monthly', new Date('2025-06-15T00:00:00Z'), null, 8)
    assert.ok(periods.length <= 8)
    const latest = periods.at(-1)!
    assert.equal(latest.payDate.toISOString().slice(0, 7), '2025-05')
    assert.ok(latest.startDate < latest.payDate)
    assert.ok(latest.payDate.getUTCMonth() !== latest.startDate.getUTCMonth() || latest.payDate.getUTCFullYear() !== latest.startDate.getUTCFullYear())
  })
  it('normalizes valid salary and hourly sources without turning blanks into zeroes', () => {
    const salary = incomeSourceCreateSchema.safeParse(validIncome)
    assert.equal(salary.success, true)
    if (salary.success) {
      assert.equal(salary.data.amount, 90000)
      assert.equal(salary.data.hoursPerWeek, undefined)
      assert.equal(salary.data.endDate, null)
      assert.equal(salary.data.employerId, null)
    }

    const hourly = incomeSourceCreateSchema.safeParse({
      ...validIncome,
      type: 'freelance',
      amount: '45.50',
      frequency: 'hourly',
      hoursPerWeek: '38',
    })
    assert.equal(hourly.success, true)
    if (hourly.success) assert.equal(hourly.data.hoursPerWeek, 38)
  })

  it('rejects malformed amounts, dates, date ranges, and type-specific fields', () => {
    for (const amount of ['', 'not-a-number', '-1', 'Infinity']) {
      assert.equal(incomeSourceCreateSchema.safeParse({ ...validIncome, amount }).success, false, amount)
    }
    assert.equal(incomeSourceCreateSchema.safeParse({ ...validIncome, startDate: 'not-a-date' }).success, false)
    assert.equal(incomeSourceCreateSchema.safeParse({ ...validIncome, startDate: '2026-03-01', endDate: '2026-02-28' }).success, false)
    assert.equal(incomeSourceCreateSchema.safeParse({ ...validIncome, frequency: 'hourly', hoursPerWeek: '' }).success, false)
    assert.equal(incomeSourceCreateSchema.safeParse({ ...validIncome, superRate: '101' }).success, false)
  })

  it('allows a partial edit while the resulting record is validated by the route', () => {
    assert.equal(incomeSourceUpdateSchema.safeParse({ amount: '95000' }).success, true)
    assert.equal(incomeSourceUpdateSchema.safeParse({ endDate: '2025-01-01' }).success, true)
  })
})

describe('income save and schema readiness regression coverage', () => {
  it('keeps ownership checks and safe diagnostics around writes', () => {
    const createRoute = readFileSync(new URL('../app/api/income/route.ts', import.meta.url), 'utf8')
    const updateRoute = readFileSync(new URL('../app/api/income/[id]/route.ts', import.meta.url), 'utf8')
    const ui = readFileSync(new URL('../app/(app)/income/income-client.tsx', import.meta.url), 'utf8')

    assert.match(createRoute, /organisation\.findFirst\(\{ where: \{ id: body\.employerId, userId \}/)
    assert.match(createRoute, /finAccount\.findFirst\(\{ where: \{ id: body\.payAccountId, userId \}/)
    assert.match(updateRoute, /organisation\.findFirst\(\{ where: \{ id: validated\.data\.employerId, userId \}/)
    assert.match(updateRoute, /finAccount\.findFirst\(\{ where: \{ id: validated\.data\.payAccountId, userId \}/)
    assert.match(createRoute, /diagnosticId/)
    assert.match(updateRoute, /diagnosticId/)
    assert.match(createRoute, /if \(!session\?\.user\) return NextResponse\.json\(\{ error: 'Unauthorized' \}, \{ status: 401 \}\)/)
    assert.match(updateRoute, /if \(!session\?\.user\) return NextResponse\.json\(\{ error: 'Unauthorized' \}, \{ status: 401 \}\)/)
    assert.match(ui, /setDialogOpen\(false\)[\s\S]*?setEditing\(null\)[\s\S]*?setForm\(\{ \.\.\.emptyForm \}\)/)
    assert.match(ui, /const refreshed = await load\(false\)/)
    assert.match(ui, /Income source saved, but the list could not be refreshed/)
    assert.match(ui, /body\?\.error\?\.message/)
  })

  it('keeps core income available when optional linked-data requests fail', () => {
    const ui = readFileSync(new URL('../app/(app)/income/income-client.tsx', import.meta.url), 'utf8')

    assert.match(ui, /Promise\.allSettled\(\[/)
    assert.match(ui, /if \(incomeResult\.status === 'rejected'\)/)
    assert.match(ui, /employersResult\.status === 'rejected'/)
    assert.match(ui, /accountsResult\.status === 'rejected'/)
    assert.match(ui, /setSources\(Array\.isArray\(incomeResult\.value\)/)
    assert.match(ui, /You can still save income without an employer\./)
    assert.match(ui, /You can still save income without a pay account\./)
    // A lookup outage must not turn an edit into an accidental unlink.
    assert.match(ui, /employerId: s\.employerId \?\? ''/)
    assert.match(ui, /payAccountId: s\.payAccountId \?\? ''/)
  })

  it('ships an explicit idempotent repair for missing salary review columns', () => {
    const migration = readFileSync(new URL('../prisma/migrations/20261007000000_income_schema_readiness/migration.sql', import.meta.url), 'utf8')
    assert.match(migration, /ADD COLUMN IF NOT EXISTS "status"/)
    assert.match(migration, /ADD COLUMN IF NOT EXISTS "decidedAt"/)
    assert.match(migration, /ADD COLUMN IF NOT EXISTS "decisionNotes"/)
    assert.match(migration, /WHERE "status" = 'pending'/)
    assert.doesNotMatch(migration, /prisma db push/)
  })
})