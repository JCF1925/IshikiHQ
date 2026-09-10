import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CALENDAR_SYNC_DIRECTIONS,
  calendarConflictSnapshotForDisplay,
  calendarSyncSelection,
  createPrivateTravelBlock,
  forwardingPreview,
  hasSyncConflict,
  isDuplicateOperation,
  matchesInviteRule,
  materialGuestUpdate,
  medicalConsentMatchesVersion,
  medicalForwardingNeedsConsent,
  outgoingCalendarEventPreview,
  exactPreviewMatches,
  invitationNotificationKey,
  ruleRequiresFirstMatchConfirmation,
  selectedInviteesForEvent,
  stableIdempotencyKey,
  type CalendarEvent,
  type InviteRule,
} from '../lib/calendar-core.ts'

const event = (overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'event-1', type: 'personal', title: 'Lunch', startDatetime: new Date('2026-09-07T02:00:00.000Z'),
  endDatetime: new Date('2026-09-07T03:00:00.000Z'), location: 'Cafe', notes: 'Bring notes',
  tags: ['social'], peopleRefs: ['person-1'], travelMinutesBefore: 25, ...overrides,
})

const rule = (overrides: Partial<InviteRule> = {}): InviteRule => ({
  id: 'rule-1', enabled: true, medicalRule: false, eventTypes: ['personal'], tags: ['social'],
  linkedPersonIds: ['person-1'], inviteePersonIds: ['person-2'], ...overrides,
})

describe('calendar M1 domain rules', () => {
  it('makes repeated operations idempotent with a deterministic scoped key', () => {
    const key = stableIdempotencyKey(['user-1', 'invite', 'event-1', 'person-2', '3'])
    assert.equal(key, stableIdempotencyKey(['user-1', 'invite', 'event-1', 'person-2', '3']))
    assert.equal(isDuplicateOperation(new Set([key]), key), true)
    assert.equal(isDuplicateOperation(new Set([key]), `${key}-next`), false)
  })

  it('detects only divergent concurrent sync edits as conflicts', () => {
    assert.equal(hasSyncConflict('base', 'local edit', 'provider edit', Object.is), true)
    assert.equal(hasSyncConflict('base', 'local edit', 'base', Object.is), false)
    assert.equal(hasSyncConflict('base', 'same edit', 'same edit', Object.is), false)
  })

  it('redacts medical forwarding unless that event explicitly opts into full details', () => {
    const medical = event({ type: 'medical', title: 'Neurology appointment', location: 'Clinic' })
    assert.deepEqual(forwardingPreview(medical, ['guest@example.test']), {
      title: 'Private appointment', startDatetime: medical.startDatetime, endDatetime: medical.endDatetime,
      location: null, notes: null, attendees: [], visibility: 'private', redacted: true,
    })
    assert.equal(forwardingPreview(medical, ['guest@example.test'], true).title, 'Neurology appointment')
  })

  it('invalidates a medical forwarding preview after any event version change', () => {
    assert.equal(medicalConsentMatchesVersion({ eventVersion: 4, event: { title: 'Private appointment' } }, 4), true)
    assert.equal(medicalConsentMatchesVersion({ eventVersion: 4, event: { title: 'Private appointment' } }, 5), false)
    assert.equal(medicalConsentMatchesVersion(null, 4), false)
  })

  it('allows provider-linked medical cancellation without disclosing an updated payload', () => {
    assert.equal(medicalForwardingNeedsConsent('medical', false, 'provider-event'), true)
    assert.equal(medicalForwardingNeedsConsent('medical', true, 'provider-event'), false)
    assert.equal(medicalForwardingNeedsConsent('medical', true, null), true)
  })

  it('matches invite rules without considering event cost and requires first-match confirmation', () => {
    assert.equal(matchesInviteRule(event({ linkedCostAmount: 1, costOverrideAmount: 9999 }), rule()), true)
    assert.equal(ruleRequiresFirstMatchConfirmation(rule()), true)
    assert.equal(ruleRequiresFirstMatchConfirmation(rule({ firstMatchConfirmedAt: new Date('2026-09-01T00:00:00Z') })), false)
    assert.equal(matchesInviteRule(event({ type: 'medical' }), rule({ eventTypes: ['medical'] })), false)
    assert.equal(matchesInviteRule(event({ type: 'medical' }), rule({ eventTypes: ['medical'], medicalRule: true })), true)
  })

  it('selects invitees only from confirmed matching rules and de-duplicates people', () => {
    const confirmed = new Date('2026-09-01T00:00:00Z')
    assert.deepEqual(selectedInviteesForEvent(event(), [
      rule(),
      rule({ id: 'rule-2', firstMatchConfirmedAt: confirmed, inviteePersonIds: ['person-2', 'person-3'] }),
    ]), [
      { personId: 'person-2', ruleId: 'rule-2' },
      { personId: 'person-3', ruleId: 'rule-2' },
    ])
  })

  it('binds confirmation to the complete exact outgoing preview', () => {
    const preview = outgoingCalendarEventPreview({ ...event(), attendeeEmails: ['guest@example.com'] })
    assert.equal(preview.title, 'Lunch')
    assert.equal(preview.timezone, null)
    assert.deepEqual(preview.attendees, ['guest@example.com'])
    assert.equal(preview.visibility, 'default')
    assert.equal(exactPreviewMatches(JSON.parse(JSON.stringify(preview)), JSON.parse(JSON.stringify(preview))), true)
    assert.equal(exactPreviewMatches(preview, { ...preview, notes: 'changed' }), false)
    assert.equal(
      invitationNotificationKey('event-1', 'person-2', 3, 'updated'),
      invitationNotificationKey('event-1', 'person-2', 3, 'updated'),
    )
  })

  it('notifies guests only for material changes', () => {
    assert.equal(materialGuestUpdate(event(), event({ notes: 'Updated agenda' })), true)
    assert.equal(materialGuestUpdate(event(), event({ syncVersion: 2 })), false)
    assert.equal(materialGuestUpdate(event(), event({ location: 'Other cafe' })), true)
  })

  it('creates a separate private travel block with no attendees', () => {
    const block = createPrivateTravelBlock(event(), true)
    assert.deepEqual(block && { ...block, startDatetime: block.startDatetime.toISOString(), endDatetime: block.endDatetime.toISOString() }, {
      eventId: 'event-1', startDatetime: '2026-09-07T01:35:00.000Z', endDatetime: '2026-09-07T02:00:00.000Z',
      travelMinutes: 25, isPrivate: true, attendeeIds: [],
    })
    assert.equal(createPrivateTravelBlock(event(), false), null)
  })

  it('preserves every chosen sync direction and a de-duplicated event-type scope', () => {
    for (const direction of CALENDAR_SYNC_DIRECTIONS) {
      assert.deepEqual(calendarSyncSelection(direction, ['medical', 'work', 'medical', 'unknown']), {
        direction,
        eventTypes: ['medical', 'work'],
      })
    }
    assert.deepEqual(calendarSyncSelection('provider_to_syntropic', []), {
      direction: 'provider_to_syntropic',
      eventTypes: [],
    })
  })

  it('whitelists complete conflict snapshots for informed client-side comparison', () => {
    const snapshot = calendarConflictSnapshotForDisplay({
      title: 'Provider appointment',
      start: '2026-09-08T09:00:00.000Z',
      end: '2026-09-08T10:00:00.000Z',
      allDay: false,
      location: 'Clinic',
      notes: 'Bring referral',
      recurrence: ['RRULE:FREQ=WEEKLY'],
      attendees: ['guest@example.test'],
      visibility: 'private',
      status: 'confirmed',
      etag: '"provider-v2"',
      accessToken: 'must-not-leak',
    })
    assert.equal(snapshot?.available, true)
    assert.equal(snapshot?.title, 'Provider appointment')
    assert.deepEqual(snapshot?.attendees, ['guest@example.test'])
    assert.equal('accessToken' in (snapshot ?? {}), false)
    assert.equal(calendarConflictSnapshotForDisplay({ reason: 'Snapshot pending' })?.available, false)
  })
})