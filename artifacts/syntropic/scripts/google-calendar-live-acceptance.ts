import assert from 'node:assert/strict'
import { createHash, timingSafeEqual } from 'node:crypto'
import { prisma } from '../lib/db'
import { CalendarProviderError, GoogleCalendarProvider, type ProviderEvent } from '../lib/calendar-provider'
import { providerForConnection } from '../lib/calendar-server'

const optIn = process.env.GOOGLE_CALENDAR_LIVE_ACCEPTANCE === '1'
const dedicatedEnvironment = process.env.GOOGLE_CALENDAR_LIVE_ACCEPTANCE_ENVIRONMENT === 'NON_PRODUCTION_DEDICATED'
const connectionId = process.env.GOOGLE_CALENDAR_LIVE_ACCEPTANCE_CONNECTION_ID
const expectedFingerprint = process.env.GOOGLE_CALENDAR_LIVE_ACCEPTANCE_FINGERPRINT
const revokeRequested = process.env.GOOGLE_CALENDAR_LIVE_ACCEPTANCE_REVOKE === 'REVOKE'
const marker = `syntropic-live-calendar-${process.pid}-${Date.now()}`
const startedAt = new Date().toISOString()

type Results = Record<
  'guard' | 'provider' | 'update' | 'recurrence' | 'melbourne-timezone' | 'all-day' | 'etag-conflict' | 'cursor-list' | 'privacy' | 'deletion' | 'cleanup' | 'revoke' | 'disconnect',
  boolean | 'not-run'
>

const results: Results = {
  guard: false,
  provider: false,
  update: false,
  recurrence: false,
  'melbourne-timezone': false,
  'all-day': false,
  'etag-conflict': false,
  'cursor-list': false,
  privacy: false,
  deletion: false,
  cleanup: false,
  revoke: revokeRequested ? false : 'not-run',
  disconnect: revokeRequested ? false : 'not-run',
}
let syntheticEventCount = 0
let diagnosticCategory: string | null = null

const report = (outcome: 'pass' | 'fail') => {
  console.log(JSON.stringify({
    googleCalendarLiveAcceptance: {
      outcome,
      startedAt,
      completedAt: new Date().toISOString(),
      checks: results,
      syntheticEventCount,
      revokeRequested,
      diagnosticCategories: diagnosticCategory ? [diagnosticCategory] : [],
    },
  }))
}

const categorize = (error: unknown) => {
  if (!(error instanceof Error)) return 'unexpected-failure'
  if (error.message.includes('guard rejected')) return 'guard-rejected'
  if (error.message.includes('eligibility rejected')) return 'eligibility-rejected'
  if (error.message.includes('identity rejected')) return 'identity-rejected'
  if (
    error.message.includes('provider unavailable')
    || error instanceof CalendarProviderError
  ) return 'provider-failure'
  if (error.message.includes('cleanup failed')) return 'cleanup-failure'
  if (error instanceof assert.AssertionError) return 'assertion-failure'
  return 'acceptance-failure'
}

async function main() {
  if (
    !optIn
    || !dedicatedEnvironment
    || process.env.NODE_ENV === 'production'
    || !connectionId
    || !expectedFingerprint
    || !/^[a-f0-9]{64}$/i.test(expectedFingerprint)
  ) {
    throw new Error('live acceptance guard rejected')
  }

  const connections = await prisma.calendarProviderConnection.findMany({
    where: {
      id: connectionId,
      provider: 'google',
      status: { not: 'disabled' },
      disconnectedAt: null,
    },
    include: { settings: { where: { enabled: true } } },
  })
  // The connection ID is intentionally supplied out-of-band and never emitted.
  // A nominated dedicated connection must have one, and only one, active target.
  if (
    connections.length !== 1
    || connections[0].settings.length !== 1
    || !connections[0].providerAccountId
  ) {
    throw new Error('live acceptance eligibility rejected')
  }
  const connection = connections[0]
  const setting = connection.settings[0]
  const actualFingerprint = createHash('sha256')
    .update(`${connection.providerAccountId}\0${setting.externalCalendarId}`)
    .digest()
  const nominatedFingerprint = Buffer.from(expectedFingerprint, 'hex')
  if (
    nominatedFingerprint.length !== actualFingerprint.length
    || !timingSafeEqual(nominatedFingerprint, actualFingerprint)
  ) {
    throw new Error('live acceptance identity rejected')
  }
  const provider = await providerForConnection(connection.id)
  if (!(provider instanceof GoogleCalendarProvider)) throw new Error('live provider unavailable')
  const availableCalendars = await provider.listCalendars()
  if (
    availableCalendars.length !== 1
    || availableCalendars[0].id !== setting.externalCalendarId
  ) {
    throw new Error('dedicated calendar target rejected')
  }
  results.guard = true
  results.provider = true

  const created: Array<{ id: string; etag?: string }> = []
  let localEventId: string | undefined
  const complete = (event: ProviderEvent) => {
    if (event.status === 'cancelled') throw new Error('complete event required')
    return event
  }
  const assertPrivateNoGuests = (event: ProviderEvent) => {
    const current = complete(event)
    assert.equal(current.visibility, 'private')
    assert.deepEqual(current.attendees ?? [], [])
    return current
  }
  const listAll = async () => {
    const events: ProviderEvent[] = []
    let pageToken: string | null = null
    let cursor: string | undefined
    for (let pageCount = 0; pageCount < 20; pageCount += 1) {
      const page = await provider.listEvents(setting.externalCalendarId, null, pageToken)
      events.push(...page.events)
      cursor = page.cursor ?? cursor
      if (!page.nextPageToken) return { events, cursor }
      pageToken = page.nextPageToken
    }
    throw new Error('calendar listing exceeded page guard')
  }
  const assertDeleted = async (eventId: string) => {
    try {
      const deleted = await provider.getEvent(setting.externalCalendarId, eventId)
      assert.equal(deleted.status, 'cancelled')
    } catch (error) {
      if (
        !(error instanceof CalendarProviderError)
        || (error.status !== 404 && error.status !== 410)
      ) throw error
    }
  }
  try {
    // A local fixture proves cleanup does not leave an application record. It is
    // never sent through the worker; database worker/privacy cases are covered
    // by the deterministic tests invoked by the wrapper.
    const local = await prisma.event.create({
      data: {
        userId: connection.userId,
        title: marker,
        type: 'personal',
        startDatetime: new Date('2027-02-03T22:00:00.000Z'),
        endDatetime: new Date('2027-02-03T23:00:00.000Z'),
        peopleRefs: [],
        tags: [],
      },
    })
    localEventId = local.id
    syntheticEventCount += 1

    const timed = await provider.upsertEvent(setting.externalCalendarId, {
      title: marker,
      start: new Date('2027-02-03T22:00:00.000Z'),
      end: new Date('2027-02-03T23:00:00.000Z'),
      allDay: false,
      timezone: 'Australia/Melbourne',
      recurrence: ['RRULE:FREQ=WEEKLY;COUNT=2'],
      visibility: 'private',
      sendUpdates: 'none',
    })
    if (timed.status === 'cancelled' || !timed.etag) throw new Error('timed create rejected')
    created.push({ id: timed.id, etag: timed.etag })
    syntheticEventCount += 1

    const fetched = assertPrivateNoGuests(await provider.getEvent(setting.externalCalendarId, timed.id))
    assert.equal(fetched.start.getTime(), timed.start.getTime())
    assert.equal(fetched.end?.getTime(), timed.end?.getTime())
    assert.equal(fetched.timezone, 'Australia/Melbourne')
    assert.deepEqual(fetched.recurrence, ['RRULE:FREQ=WEEKLY;COUNT=2'])
    results.recurrence = true
    results['melbourne-timezone'] = true

    const updated = await provider.upsertEvent(setting.externalCalendarId, {
      id: timed.id,
      etag: timed.etag,
      title: `${marker}-updated`,
      start: timed.start,
      end: timed.end,
      allDay: false,
      timezone: 'Australia/Melbourne',
      recurrence: ['RRULE:FREQ=WEEKLY;COUNT=2'],
      visibility: 'private',
      sendUpdates: 'none',
    })
    if (updated.status === 'cancelled' || !updated.etag) throw new Error('timed update rejected')
    const updatedDetails = assertPrivateNoGuests(updated)
    assert.equal(updatedDetails.title, `${marker}-updated`)
    assert.equal(updatedDetails.start.getTime(), timed.start.getTime())
    assert.equal(updatedDetails.end?.getTime(), timed.end?.getTime())
    assert.equal(updatedDetails.timezone, 'Australia/Melbourne')
    assert.deepEqual(updatedDetails.recurrence, ['RRULE:FREQ=WEEKLY;COUNT=2'])
    const refetchedUpdate = assertPrivateNoGuests(
      await provider.getEvent(setting.externalCalendarId, timed.id),
    )
    assert.equal(refetchedUpdate.title, `${marker}-updated`)
    assert.equal(refetchedUpdate.start.getTime(), timed.start.getTime())
    assert.equal(refetchedUpdate.end?.getTime(), timed.end?.getTime())
    assert.equal(refetchedUpdate.timezone, 'Australia/Melbourne')
    assert.deepEqual(refetchedUpdate.recurrence, ['RRULE:FREQ=WEEKLY;COUNT=2'])
    results.update = true
    created[0].etag = updated.etag
    await assert.rejects(
      provider.upsertEvent(setting.externalCalendarId, {
        id: timed.id, etag: timed.etag, title: marker, start: timed.start, end: timed.end,
        allDay: false, timezone: 'Australia/Melbourne', visibility: 'private', sendUpdates: 'none',
      }),
      (error: unknown) => error instanceof Error && 'status' in error && error.status === 412,
    )
    results['etag-conflict'] = true

    const allDay = await provider.upsertEvent(setting.externalCalendarId, {
      title: `${marker}-all-day`,
      start: new Date('2027-02-14T00:00:00.000Z'),
      end: new Date('2027-02-15T00:00:00.000Z'),
      allDay: true,
      visibility: 'private',
      sendUpdates: 'none',
    })
    if (allDay.status === 'cancelled') throw new Error('all-day create rejected')
    created.push({ id: allDay.id, etag: allDay.etag })
    syntheticEventCount += 1
    const allDayFetched = assertPrivateNoGuests(await provider.getEvent(setting.externalCalendarId, allDay.id))
    assert.equal(allDayFetched.allDay, true)
    assert.equal(allDayFetched.start.toISOString().slice(0, 10), '2027-02-14')
    assert.equal(allDayFetched.end?.toISOString().slice(0, 10), '2027-02-15')
    results['all-day'] = true

    const fullListing = await listAll()
    if (!fullListing.cursor) throw new Error('initial cursor unavailable')
    const listedTimed = fullListing.events.find(event => event.id === timed.id)
    const listedAllDay = fullListing.events.find(event => event.id === allDay.id)
    if (!listedTimed || !listedAllDay) throw new Error('synthetic events absent from listing')
    assert.equal(assertPrivateNoGuests(listedTimed).title, `${marker}-updated`)
    assertPrivateNoGuests(listedAllDay)
    const incrementalPage = await provider.listEvents(setting.externalCalendarId, fullListing.cursor)
    if (!incrementalPage.cursor) throw new Error('incremental cursor unavailable')
    results['cursor-list'] = true
    results.privacy = true
  } finally {
    let cleanupSucceeded = true
    for (const event of created.reverse()) {
      try {
        await provider.cancelEvent(setting.externalCalendarId, event.id, event.etag)
        await assertDeleted(event.id)
      } catch {
        cleanupSucceeded = false
      }
    }
    if (localEventId) {
      try {
        await prisma.event.delete({ where: { id: localEventId } })
      } catch {
        cleanupSucceeded = false
      }
    }
    results.deletion = created.length > 0 && cleanupSucceeded
    results.cleanup = cleanupSucceeded
    if (!cleanupSucceeded) throw new Error('synthetic fixture cleanup failed')
  }
  // Revoke only after every live assertion and cleanup has succeeded. A failed
  // acceptance run must leave the dedicated grant available for diagnosis.
  if (revokeRequested) {
    await provider.revoke()
    if (connection.credentialReference) {
      await prisma.account.updateMany({
        where: { id: connection.credentialReference, userId: connection.userId },
        data: { access_token: null, refresh_token: null, expires_at: null },
      })
    }
    await prisma.$transaction([
      prisma.calendarProviderConnection.update({
        where: { id: connection.id },
        data: {
          status: 'disabled',
          disconnectedAt: new Date(),
          credentialReference: null,
          lastSyncError: null,
        },
      }),
      prisma.calendarSyncJob.updateMany({
        where: {
          connectionId: connection.id,
          status: { in: ['queued', 'failed', 'running'] },
        },
        data: {
          status: 'cancelled',
          completedAt: new Date(),
          error: 'Calendar provider disconnected',
        },
      }),
    ])
    results.revoke = true
    results.disconnect = true
  }
  report('pass')
}

main()
  .catch((error: unknown) => {
    diagnosticCategory = categorize(error)
    report('fail')
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })