import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { advance, nextOccurrence, occurrencesBetween } from '../lib/recurrence.ts'

const utc = (value: string) => new Date(`${value}T00:00:00.000Z`)

describe('recurrence baseline', () => {
  it('clamps monthly and annual calendar recurrences at month end', () => {
    assert.equal(advance(utc('2025-01-31'), 'monthly').toISOString(), '2025-02-28T00:00:00.000Z')
    assert.equal(advance(utc('2024-02-29'), 'annually').toISOString(), '2025-02-28T00:00:00.000Z')
  })

  it('generates an exclusive-after and inclusive-until range', () => {
    assert.deepEqual(
      occurrencesBetween(utc('2025-01-01'), 'fortnightly', 1, utc('2025-01-01'), utc('2025-02-15')).map((d) => d.toISOString()),
      ['2025-01-15T00:00:00.000Z', '2025-01-29T00:00:00.000Z', '2025-02-12T00:00:00.000Z'],
    )
  })

  it('honours an end date when looking up the next occurrence', () => {
    assert.equal(nextOccurrence(utc('2025-01-01'), 'weekly', 1, utc('2025-02-01'), utc('2025-01-31')), null)
  })
})