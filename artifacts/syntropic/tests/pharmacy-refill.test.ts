import assert from 'node:assert/strict'
import test from 'node:test'
import { forecastRefill, fortnightStart } from '../lib/pharmacy-refill'

const baseSchedule = {
  id: 'schedule-1',
  times: ['08:00'],
  doseAmount: '1',
  startDate: new Date('2026-09-01T00:00:00'),
  endDate: null,
}

test('forecast uses bounded scheduled use and recorded PRN history without inventing future doses', () => {
  const now = new Date('2026-09-15T00:00:00')
  const result = forecastRefill({
    now,
    stock: 20,
    reorderThreshold: 5,
    schedules: [
      { ...baseSchedule, frequency: 'twice_daily' },
      { ...baseSchedule, id: 'schedule-prn', frequency: 'as_needed' },
    ],
    logs: [
      { scheduleId: 'schedule-prn', takenAt: new Date('2026-09-10T12:00:00'), doseTaken: '2', skipped: false },
      { scheduleId: 'schedule-prn', takenAt: new Date('2026-09-16T12:00:00'), doseTaken: '9', skipped: false },
    ],
    prescriptions: [{ quantity: 30, repeats: 1, repeatsUsed: 0, expiryDate: null }],
  })

  assert.equal(result.scheduled14, 28)
  assert.equal(result.prnRecorded, 2)
  assert.equal(result.projected, -10)
  assert.equal(result.uncertain, true)
  assert.equal(result.availableFills, 2)
})

test('fortnight anchors are stable for dates in the same period', () => {
  const first = fortnightStart(new Date('2026-09-09T15:00:00'))
  const second = fortnightStart(new Date('2026-09-22T08:00:00'))
  assert.equal(first.toISOString(), '2026-08-27T00:00:00.000Z')
  assert.equal(second.toISOString(), '2026-09-10T00:00:00.000Z')
})