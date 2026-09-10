import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { GOOGLE_CALENDAR_AUTH_SCOPE } from '../lib/calendar-scopes'
import {
  connectGoogleCalendarAccount,
  persistExistingGoogleCalendarGrant,
  publicCalendarConnection,
} from '../lib/calendar-oauth-server'
import { prepareExclusiveCalendarTarget } from '../lib/calendar-target'
import {
  cancelCalendarPullJobsForConnection,
  ensureCalendarPullJob,
  executeCalendarSyncJob,
} from '../lib/calendar-server'
import type { CalendarProvider, EventPage } from '../lib/calendar-provider'

async function main() {
  const user = await prisma.user.create({
    data: {
      email: `calendar-acceptance-${Date.now()}@example.com`,
      name: 'Calendar acceptance',
    },
  })

  try {
    const account = await prisma.account.create({
    data: {
      userId: user.id,
      type: 'oauth',
      provider: 'google',
      providerAccountId: 'fixture-google-account',
      access_token: 'identity-access',
      refresh_token: 'identity-refresh',
      scope: 'openid email profile',
    },
  })
  const connection = await prisma.calendarProviderConnection.create({
    data: {
      userId: user.id,
      provider: 'google',
      providerAccountId: 'fixture-google-account',
      status: 'disabled',
      disconnectedAt: new Date(),
    },
  })

  assert.equal(await persistExistingGoogleCalendarGrant(user.id, {
    type: 'oauth',
    provider: 'google',
    providerAccountId: 'fixture-google-account',
    access_token: 'calendar-access-1',
    refresh_token: 'calendar-refresh-1',
    expires_at: 2_000_000_000,
    token_type: 'bearer',
    scope: GOOGLE_CALENDAR_AUTH_SCOPE,
  }), 'updated')
  const initialConnect = await connectGoogleCalendarAccount(user.id, { displayName: 'Google Calendar' })
  assert.equal(initialConnect?.id, connection.id)
  assert.equal(initialConnect?.credentialReference, account.id)
  assert.equal(initialConnect?.disconnectedAt, null)

  const otherConnection = await prisma.calendarProviderConnection.create({
    data: {
      userId: user.id,
      provider: 'google',
      providerAccountId: 'fixture-second-google-account',
      status: 'synced',
    },
  })
  const unidentifiedConnection = await prisma.calendarProviderConnection.create({
    data: {
      userId: user.id,
      provider: 'microsoft',
      status: 'pending',
    },
  })
  await assert.rejects(
    prisma.calendarProviderConnection.create({
      data: {
        userId: user.id,
        provider: 'microsoft',
        status: 'pending',
      },
    }),
    /CalendarProviderConnection_userId_provider_null_account_key|Unique constraint failed/,
  )
  await assert.rejects(
    prisma.calendarProviderConnection.create({
      data: {
        userId: user.id,
        provider: 'google',
        status: 'pending',
      },
    }),
    /CalendarProviderConnection_google_providerAccountId_check|constraint failed/,
  )
  await prisma.calendarProviderConnection.delete({ where: { id: unidentifiedConnection.id } })
  const oldSetting = await prisma.calendarSyncSetting.create({
    data: {
      connectionId: otherConnection.id,
      externalCalendarId: 'old-calendar',
      calendarName: 'Old calendar',
      direction: 'provider_to_syntropic',
      eventTypes: [],
      enabled: true,
    },
  })
  const newSetting = await prisma.calendarSyncSetting.create({
    data: {
      connectionId: connection.id,
      externalCalendarId: 'new-calendar',
      calendarName: 'New calendar',
      direction: 'two_way',
      eventTypes: [],
      enabled: false,
    },
  })
  const repeatedConnections = await Promise.all([
    connectGoogleCalendarAccount(user.id, {}),
    connectGoogleCalendarAccount(user.id, { displayName: 'Google Calendar' }),
  ])
  assert.deepEqual(repeatedConnections.map(reconnected => reconnected?.id), [connection.id, connection.id])
  assert.equal(await prisma.calendarProviderConnection.count({
    where: { userId: user.id, provider: 'google', providerAccountId: 'fixture-google-account' },
  }), 1)
  assert.equal(await prisma.calendarSyncSetting.count({ where: { connectionId: connection.id } }), 1)
  const safeConnection = publicCalendarConnection(await prisma.calendarProviderConnection.findUniqueOrThrow({
    where: { id: connection.id },
    include: { settings: true },
  }))
  assert.equal('userId' in safeConnection, false)
  assert.equal('providerAccountId' in safeConnection, false)
  assert.equal('credentialReference' in safeConnection, false)
  assert.equal(safeConnection.settings?.length, 1)
  const event = await prisma.event.create({
    data: {
      userId: user.id,
      title: 'Mapped event',
      startDatetime: new Date('2026-09-08T01:00:00.000Z'),
      peopleRefs: [],
      tags: [],
      externalProvider: 'google',
      externalCalendarId: 'old-calendar',
      externalEventId: 'old-provider-event',
      externalEtag: 'old-etag',
      syncStatus: 'synced',
    },
  })
  const oldJob = await ensureCalendarPullJob(otherConnection.id, 'old-calendar', 'two_way')
  assert.ok(oldJob)
  await prisma.$transaction(async tx => {
    const switched = await prepareExclusiveCalendarTarget(tx, {
      connectionId: connection.id,
      userId: user.id,
      externalCalendarId: 'new-calendar',
    })
    assert.deepEqual(switched.previousCalendarIds, ['old-calendar'])
    assert.equal(switched.resetEvents, 1)
    await tx.calendarSyncSetting.update({ where: { id: newSetting.id }, data: { enabled: true } })
  })
  const [oldAfter, newAfter, eventAfter, oldJobAfter] = await Promise.all([
    prisma.calendarSyncSetting.findUniqueOrThrow({ where: { id: oldSetting.id } }),
    prisma.calendarSyncSetting.findUniqueOrThrow({ where: { id: newSetting.id } }),
    prisma.event.findUniqueOrThrow({ where: { id: event.id } }),
    prisma.calendarSyncJob.findUniqueOrThrow({ where: { id: oldJob.id } }),
  ])
  assert.equal(oldAfter.enabled, false)
  assert.equal(newAfter.enabled, true)
  assert.equal(eventAfter.externalCalendarId, null)
  assert.equal(eventAfter.externalEventId, null)
  assert.equal(eventAfter.syncStatus, 'pending')
  assert.equal(oldJobAfter.status, 'cancelled')

  await prisma.event.delete({ where: { id: event.id } })
  const providerPages: EventPage[] = [
    {
      events: [{
        id: 'remote-event-1',
        etag: '"remote-1"',
        status: 'confirmed',
        title: 'Provider event one',
        start: new Date('2026-09-09T01:00:00.000Z'),
        end: new Date('2026-09-09T02:00:00.000Z'),
        allDay: false,
      }],
      cursor: 'sync-1',
    },
    {
      events: [{
        id: 'remote-event-2',
        etag: '"remote-2"',
        status: 'confirmed',
        title: 'Provider event two',
        start: new Date('2026-09-10T01:00:00.000Z'),
        end: new Date('2026-09-10T02:00:00.000Z'),
        allDay: false,
      }],
      cursor: 'sync-2',
    },
  ]
  const seenCursors: Array<string | null | undefined> = []
  const fixtureProvider: CalendarProvider = {
    name: 'google',
    async listCalendars() { return [] },
    async listEvents(_calendarId, cursor, pageToken) {
      assert.equal(pageToken, null)
      seenCursors.push(cursor)
      const page = providerPages.shift()
      assert.ok(page)
      return page
    },
    async getEvent() { throw new Error('No conflict lookup expected') },
    async upsertEvent() { throw new Error('Provider-only polling must not push local events') },
    async cancelEvent() { throw new Error('No cancellation expected') },
    async revoke() {},
  }
  const firstPollAt = new Date()
  const firstPoll = await ensureCalendarPullJob(connection.id, 'new-calendar', 'provider_to_syntropic', firstPollAt)
  assert.ok(firstPoll)
  const duplicatePoll = await ensureCalendarPullJob(connection.id, 'new-calendar', 'provider_to_syntropic', firstPollAt)
  assert.equal(duplicatePoll?.id, firstPoll.id)
  assert.equal(await prisma.calendarSyncJob.count({ where: { idempotencyKey: firstPoll.idempotencyKey } }), 1)

  const firstPull = await executeCalendarSyncJob(firstPoll.id, firstPollAt, fixtureProvider)
  assert.deepEqual(firstPull, { succeeded: true, rescheduled: true })
  assert.equal(await prisma.event.count({ where: { userId: user.id, externalEventId: 'remote-event-1' } }), 1)
  const afterFirstPull = await prisma.calendarSyncJob.findUniqueOrThrow({ where: { id: firstPoll.id } })
  assert.equal(afterFirstPull.status, 'queued')
  assert.ok(afterFirstPull.scheduledAt > firstPollAt)

  const secondPull = await executeCalendarSyncJob(firstPoll.id, afterFirstPull.scheduledAt, fixtureProvider)
  assert.deepEqual(secondPull, { succeeded: true, rescheduled: true })
  assert.equal(await prisma.event.count({ where: { userId: user.id, externalEventId: 'remote-event-2' } }), 1)
  assert.deepEqual(seenCursors, [null, 'sync-1'])

  await cancelCalendarPullJobsForConnection(connection.id, 'Acceptance disconnect')
  assert.equal((await prisma.calendarSyncJob.findUniqueOrThrow({ where: { id: firstPoll.id } })).status, 'cancelled')

  await prisma.$transaction([
    prisma.account.update({
      where: { id: account.id },
      data: { access_token: null, refresh_token: null, expires_at: null },
    }),
    prisma.calendarProviderConnection.update({
      where: { id: connection.id },
      data: { status: 'disabled', disconnectedAt: new Date(), credentialReference: null },
    }),
  ])
  assert.equal(await persistExistingGoogleCalendarGrant(user.id, {
    type: 'oauth',
    provider: 'google',
    providerAccountId: 'fixture-google-account',
    access_token: 'calendar-access-2',
    refresh_token: 'calendar-refresh-2',
    expires_at: 2_000_000_100,
    token_type: 'bearer',
    scope: GOOGLE_CALENDAR_AUTH_SCOPE,
  }), 'updated')
  const reconnected = await connectGoogleCalendarAccount(user.id, { displayName: 'Google Calendar' })
  const refreshedAccount = await prisma.account.findUniqueOrThrow({ where: { id: account.id } })
  assert.equal(reconnected?.id, connection.id)
  assert.equal(reconnected?.credentialReference, account.id)
  assert.equal(refreshedAccount.refresh_token, 'calendar-refresh-2')

    console.log('calendar OAuth acceptance: upgrade, reconnect, target switch, and recurring provider polling passed')
  } finally {
    await prisma.user.delete({ where: { id: user.id } })
    await prisma.$disconnect()
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})