import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { PrismaClient } from '@prisma/client'
import { executeCalendarSyncJob } from '../lib/calendar-server.ts'
import {
  CalendarProviderError,
  type CalendarProvider,
  type ProviderEvent,
  type UpsertEvent,
} from '../lib/calendar-provider.ts'
import {
  calendarPullJobKey,
  guestNotificationMode,
  invitationDeliveryPlan,
  isCalendarPullJobKey,
  nextCalendarPullAt,
} from '../lib/calendar-core.ts'

const prisma = new PrismaClient()
const marker = `calendar-worker-${process.pid}-${Date.now()}`
let userId = ''
let jobId = ''
const writes: UpsertEvent[] = []
let listCalls = 0

const provider: CalendarProvider = {
  name: 'google',
  listCalendars: async () => [],
  listEvents: async (_calendarId, _cursor, pageToken) => {
    listCalls += 1
    return pageToken
      ? { events: [], cursor: 'fixture-cursor' }
      : { events: [], nextPageToken: 'fixture-page-2' }
  },
  getEvent: async () => ({
    id: 'remote-conflict',
    etag: '"provider-etag"',
    status: 'confirmed',
    title: 'Provider conflict',
    start: new Date('2026-09-09T09:00:00.000Z'),
    end: new Date('2026-09-09T10:00:00.000Z'),
    allDay: false,
  }),
  upsertEvent: async (_calendarId, event) => {
    writes.push(event)
    return { ...event, id: event.id ?? 'remote-fixture', etag: '"fixture-etag"' } as ProviderEvent
  },
  cancelEvent: async () => undefined,
  revoke: async () => undefined,
}

describe('Calendar worker acceptance fixture', () => {
  before(async () => {
    const user = await prisma.user.create({
      data: { email: `${marker}@example.test`, name: 'Calendar fixture' },
    })
    userId = user.id
    const person = await prisma.person.create({
      data: { userId, name: 'Guest', email: 'guest@example.test' },
    })
    const event = await prisma.event.create({
      data: {
        userId,
        title: 'Fixture appointment',
        type: 'personal',
        startDatetime: new Date('2026-09-08T09:00:00.000Z'),
        endDatetime: new Date('2026-09-08T10:00:00.000Z'),
        peopleRefs: [person.id],
        tags: ['fixture'],
      },
    })
    await prisma.calendarInviteRule.create({
      data: {
        userId,
        name: 'Confirmed fixture rule',
        enabled: true,
        medicalRule: false,
        eventTypes: ['personal'],
        tags: ['fixture'],
        linkedPersonIds: [person.id],
        inviteePersonIds: [person.id],
        firstMatchConfirmedAt: new Date(),
      },
    })
    const connection = await prisma.calendarProviderConnection.create({
      data: { userId, provider: 'google', providerAccountId: marker, status: 'pending' },
    })
    await prisma.calendarSyncSetting.create({
      data: {
        connectionId: connection.id,
        externalCalendarId: 'fixture-calendar',
        direction: 'two_way',
        eventTypes: [],
        enabled: true,
      },
    })
    const job = await prisma.calendarSyncJob.create({
      data: {
        connectionId: connection.id,
        externalCalendarId: 'fixture-calendar',
        direction: 'two_way',
        idempotencyKey: marker,
      },
    })
    jobId = job.id
    assert.equal(event.syncStatus, 'pending')
  })

  after(async () => {
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => undefined)
    await prisma.$disconnect()
  })

  it('executes a confirmed invitation exactly once and advances the cursor', async () => {
    assert.deepEqual(await executeCalendarSyncJob(jobId, new Date(), provider), { succeeded: true })
    assert.deepEqual(writes[0].attendees, ['guest@example.test'])

    const decision = await prisma.eventInviteDecision.findFirstOrThrow({ where: { event: { userId } } })
    assert.equal(decision.invitationStatus, 'sent')
    assert.equal(decision.lastNotifiedVersion, 1)
    assert.equal(await prisma.calendarAuditRecord.count({
      where: { userId, action: 'invitation_sent' },
    }), 1)
    assert.equal((await prisma.calendarSyncCursor.findFirstOrThrow({
      where: { connection: { userId } },
    })).cursor, 'fixture-cursor')
    assert.equal(listCalls, 2)

    assert.deepEqual(await executeCalendarSyncJob(jobId, new Date(), provider), { skipped: true })
    assert.equal(writes.length, 1)
    assert.equal(await prisma.calendarAuditRecord.count({
      where: { userId, action: 'invitation_sent' },
    }), 1)
  })

  it('records provider etag conflicts instead of overwriting either version', async () => {
    const connection = await prisma.calendarProviderConnection.findFirstOrThrow({ where: { userId } })
    const event = await prisma.event.create({
      data: {
        userId,
        title: 'Concurrent fixture edit',
        type: 'personal',
        startDatetime: new Date('2026-09-09T09:00:00.000Z'),
        endDatetime: new Date('2026-09-09T10:00:00.000Z'),
        peopleRefs: [],
        tags: [],
        externalProvider: 'google',
        externalCalendarId: 'fixture-calendar',
        externalEventId: 'remote-conflict',
        externalEtag: '"old-etag"',
      },
    })
    const job = await prisma.calendarSyncJob.create({
      data: {
        connectionId: connection.id,
        externalCalendarId: 'fixture-calendar',
        direction: 'syntropic_to_provider',
        idempotencyKey: `${marker}-conflict`,
      },
    })
    const conflictProvider: CalendarProvider = {
      ...provider,
      upsertEvent: async () => {
        throw new CalendarProviderError('Provider version changed', 412)
      },
    }

    assert.deepEqual(await executeCalendarSyncJob(job.id, new Date(), conflictProvider), { succeeded: true })
    assert.equal((await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).syncStatus, 'conflict')
    assert.equal(await prisma.calendarSyncConflict.count({
      where: { eventId: event.id, resolvedAt: null },
    }), 1)
  })

  it('keeps an unavailable provider queued for an offline retry', async () => {
    const connection = await prisma.calendarProviderConnection.findFirstOrThrow({ where: { userId } })
    const job = await prisma.calendarSyncJob.create({
      data: {
        connectionId: connection.id,
        externalCalendarId: 'fixture-calendar',
        direction: 'two_way',
        idempotencyKey: `${marker}-offline`,
      },
    })
    assert.deepEqual(await executeCalendarSyncJob(job.id), { disconnected: true })
    assert.equal((await prisma.calendarSyncJob.findUniqueOrThrow({ where: { id: job.id } })).status, 'queued')
  })

  it('applies deletion policy to an id-and-status-only provider tombstone', async () => {
    const connection = await prisma.calendarProviderConnection.findFirstOrThrow({ where: { userId } })
    const event = await prisma.event.create({
      data: {
        userId,
        title: 'Provider-deleted fixture',
        type: 'personal',
        startDatetime: new Date('2026-09-10T09:00:00.000Z'),
        endDatetime: new Date('2026-09-10T10:00:00.000Z'),
        peopleRefs: [],
        tags: [],
        externalProvider: 'google',
        externalCalendarId: 'fixture-calendar',
        externalEventId: 'remote-deleted',
        externalEtag: '"before-delete"',
        syncStatus: 'synced',
      },
    })
    const job = await prisma.calendarSyncJob.create({
      data: {
        connectionId: connection.id,
        externalCalendarId: 'fixture-calendar',
        direction: 'provider_to_syntropic',
        idempotencyKey: `${marker}-provider-delete`,
      },
    })
    const tombstoneProvider: CalendarProvider = {
      ...provider,
      listEvents: async () => ({
        events: [{ id: 'remote-deleted', status: 'cancelled' }],
        cursor: 'cursor-after-delete',
      }),
    }

    assert.deepEqual(await executeCalendarSyncJob(job.id, new Date(), tombstoneProvider), { succeeded: true })
    const cancelled = await prisma.event.findUniqueOrThrow({ where: { id: event.id } })
    assert.equal(cancelled.isCancelled, true)
    assert.equal(cancelled.syncStatus, 'cancelled')
  })

  it('scrubs revoked credentials and cancels all active jobs after a permanent authorization failure', async () => {
    const account = await prisma.account.create({
      data: {
        userId,
        type: 'oauth',
        provider: 'google',
        providerAccountId: `${marker}-revoked`,
        access_token: 'revoked-access',
        refresh_token: 'revoked-refresh',
        expires_at: 2_000_000_000,
      },
    })
    const connection = await prisma.calendarProviderConnection.create({
      data: {
        userId,
        provider: 'google',
        providerAccountId: `${marker}-revoked`,
        credentialReference: account.id,
      },
    })
    await prisma.calendarSyncSetting.create({
      data: {
        connectionId: connection.id,
        externalCalendarId: 'revoked-calendar',
        direction: 'provider_to_syntropic',
        eventTypes: [],
      },
    })
    const jobs = await Promise.all([
      prisma.calendarSyncJob.create({
        data: {
          connectionId: connection.id,
          externalCalendarId: 'revoked-calendar',
          direction: 'provider_to_syntropic',
          idempotencyKey: `${marker}-revoked-running`,
        },
      }),
      prisma.calendarSyncJob.create({
        data: {
          connectionId: connection.id,
          externalCalendarId: 'revoked-calendar',
          direction: 'provider_to_syntropic',
          idempotencyKey: `${marker}-revoked-queued`,
        },
      }),
    ])
    const revokedProvider: CalendarProvider = {
      ...provider,
      listEvents: async () => { throw new CalendarProviderError('Google authorization revoked', 401) },
    }

    assert.deepEqual(await executeCalendarSyncJob(jobs[0].id, new Date(), revokedProvider), {
      succeeded: false,
      disabled: true,
      error: 'Google authorization revoked',
    })
    const disabled = await prisma.calendarProviderConnection.findUniqueOrThrow({ where: { id: connection.id } })
    assert.equal(disabled.status, 'disabled')
    assert.equal(disabled.credentialReference, null)
    assert.ok(disabled.disconnectedAt)
    const scrubbed = await prisma.account.findUniqueOrThrow({ where: { id: account.id } })
    assert.equal(scrubbed.access_token, null)
    assert.equal(scrubbed.refresh_token, null)
    assert.equal(scrubbed.expires_at, null)
    assert.deepEqual(
      (await prisma.calendarSyncJob.findMany({
        where: { connectionId: connection.id },
        orderBy: { idempotencyKey: 'asc' },
        select: { status: true },
      })).map(row => row.status),
      ['cancelled', 'cancelled'],
    )
  })

  it('retains valid credentials after a transient provider failure', async () => {
    const account = await prisma.account.create({
      data: {
        userId,
        type: 'oauth',
        provider: 'google',
        providerAccountId: `${marker}-transient`,
        access_token: 'valid-access',
        refresh_token: 'valid-refresh',
        expires_at: 2_000_000_000,
      },
    })
    const connection = await prisma.calendarProviderConnection.create({
      data: {
        userId,
        provider: 'google',
        providerAccountId: `${marker}-transient`,
        credentialReference: account.id,
      },
    })
    await prisma.calendarSyncSetting.create({
      data: {
        connectionId: connection.id,
        externalCalendarId: 'transient-calendar',
        direction: 'provider_to_syntropic',
        eventTypes: [],
      },
    })
    const job = await prisma.calendarSyncJob.create({
      data: {
        connectionId: connection.id,
        externalCalendarId: 'transient-calendar',
        direction: 'provider_to_syntropic',
        idempotencyKey: `${marker}-transient`,
      },
    })
    const transientProvider: CalendarProvider = {
      ...provider,
      listEvents: async () => { throw new CalendarProviderError('Google temporarily unavailable', 503) },
    }

    assert.deepEqual(await executeCalendarSyncJob(job.id, new Date(), transientProvider), {
      succeeded: false,
      deadLetter: false,
      rescheduled: false,
      error: 'Google temporarily unavailable',
    })
    const retainedConnection = await prisma.calendarProviderConnection.findUniqueOrThrow({ where: { id: connection.id } })
    assert.equal(retainedConnection.status, 'pending')
    assert.equal(retainedConnection.credentialReference, account.id)
    const retained = await prisma.account.findUniqueOrThrow({ where: { id: account.id } })
    assert.equal(retained.access_token, 'valid-access')
    assert.equal(retained.refresh_token, 'valid-refresh')
    assert.equal(retained.expires_at, 2_000_000_000)
  })

  it('notifies guests for pending material changes but not internal-only sync versions', () => {
    const emails = new Map([['person-1', 'guest@example.com']])
    const internalOnly = invitationDeliveryPlan([{
      personId: 'person-1',
      decision: 'manually_added',
      invitationStatus: 'updated',
      lastNotifiedVersion: 1,
    }], emails, 2)
    assert.deepEqual(internalOnly.attendees, ['guest@example.com'])
    assert.deepEqual(internalOnly.updated, [])
    assert.equal(guestNotificationMode(internalOnly), 'none')

    const material = invitationDeliveryPlan([{
      personId: 'person-1',
      decision: 'manually_added',
      invitationStatus: 'pending',
      lastNotifiedVersion: 1,
    }], emails, 2)
    assert.deepEqual(material.updated, ['person-1'])
    assert.equal(guestNotificationMode(material), 'all')

    const removal = invitationDeliveryPlan([{
      personId: 'person-1',
      decision: 'manually_removed',
      invitationStatus: 'pending',
      lastNotifiedVersion: 1,
    }], emails, 2)
    assert.deepEqual(removal.cancelled, ['person-1'])
    assert.equal(guestNotificationMode(removal), 'all')
  })

  it('uses one stable recurring pull identity and a deterministic next interval', () => {
    const key = calendarPullJobKey('connection-1', 'calendar-1')
    assert.equal(key, calendarPullJobKey('connection-1', 'calendar-1'))
    assert.equal(isCalendarPullJobKey(key), true)
    assert.deepEqual(
      nextCalendarPullAt(new Date('2026-09-07T00:00:00.000Z')),
      new Date('2026-09-07T00:05:00.000Z'),
    )
  })
})
