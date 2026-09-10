import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { readFileSync } from 'node:fs'
import { prisma as databasePrisma } from '../lib/db.ts'
import { CalendarProviderError, GoogleCalendarProvider } from '../lib/calendar-provider.ts'
import {
  CALENDAR_PERMISSION_ERROR_CONTRACT,
  CALENDAR_PROVIDER_ERROR_CONTRACT,
  calendarProviderErrorContract,
} from '../lib/calendar-oauth-server.ts'

type RouteFixtureState = {
  session: { user: { id: string } } | null
  connection: {
    id: string
    userId: string
    status: string
    disconnectedAt: Date | null
    settings: Array<{ externalCalendarId: string; direction: string }>
  } | null
  provider: { listCalendars: () => Promise<unknown[]> } | null
  syncResults: Array<Record<string, unknown>>
  syncError: unknown
  createdJobs: Array<{ id: string; externalCalendarId: string }>
  providerLookupCalls: number
  syncExecutionCalls: number
  updates: Array<{ where: unknown; data: unknown }>
  event: Record<string, unknown> | null
  person: Record<string, unknown> | null
  inviteDecision: Record<string, unknown> | null
  medicalConsent: Record<string, unknown> | null
  privateTravelBlock: Record<string, unknown> | null
  conflicts: Array<Record<string, any>>
  resolvedConflict: Record<string, unknown>
  enqueueResult: Record<string, unknown>
}

/* Database acceptance coverage. Enable only against an isolated disposable DB:
 * CALENDAR_ROUTE_DATABASE_TESTS=1 pnpm exec tsx --test --experimental-test-module-mocks tests/calendar-provider.test.ts */
const databaseTestsEnabled = process.env.CALENDAR_ROUTE_DATABASE_TESTS === '1'
let useDatabaseRoute = false
const routeFixture: RouteFixtureState = {
  session: { user: { id: 'user-1' } },
  connection: {
    id: 'connection-1',
    userId: 'user-1',
    status: 'active',
    disconnectedAt: null,
    settings: [],
  },
  provider: null,
  syncResults: [],
  syncError: null,
  createdJobs: [],
  providerLookupCalls: 0,
  syncExecutionCalls: 0,
  updates: [],
  event: { id: 'event-1', userId: 'user-1' },
  person: { id: 'ckxxxxxxxxxxxxxxxxxxxxxxx', userId: 'user-1', email: 'person@example.test' },
  inviteDecision: null,
  medicalConsent: null,
  privateTravelBlock: null,
  conflicts: [],
  resolvedConflict: {},
  enqueueResult: { queued: true },
}

const auth = async () => routeFixture.session
const fixturePrisma = {
  calendarProviderConnection: {
    findFirst: async () => routeFixture.connection,
    update: async (args: { where: unknown; data: unknown }) => {
      routeFixture.updates.push(args)
      return routeFixture.connection
    },
  },
  calendarSyncJob: {
    create: async ({ data }: { data: { externalCalendarId: string } }) => {
      const job = { id: `job-${routeFixture.createdJobs.length + 1}`, externalCalendarId: data.externalCalendarId }
      routeFixture.createdJobs.push(job)
      return job
    },
  },
  event: {
    findFirst: async () => routeFixture.event,
    update: async () => {
      if (routeFixture.event) {
        const currentVersion = typeof routeFixture.event.syncVersion === 'number' ? routeFixture.event.syncVersion : 0
        routeFixture.event = { ...routeFixture.event, syncVersion: currentVersion + 1 }
      }
      return routeFixture.event
    },
  },
  person: {
    findFirst: async () => routeFixture.person,
  },
  eventInviteDecision: {
    findUnique: async () => routeFixture.inviteDecision,
    findMany: async () => routeFixture.inviteDecision ? [routeFixture.inviteDecision] : [],
    upsert: async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
      routeFixture.inviteDecision = {
        id: 'decision-1',
        ...(routeFixture.inviteDecision ?? create),
        ...update,
      }
      return routeFixture.inviteDecision
    },
    update: async () => routeFixture.inviteDecision,
  },
  eventMedicalForwardingConsent: {
    upsert: async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
      routeFixture.medicalConsent = {
        id: 'consent-1',
        ...(routeFixture.medicalConsent ?? create),
        ...update,
      }
      return routeFixture.medicalConsent
    },
  },
  calendarIdempotencyKey: {
    upsert: async () => undefined,
  },
  calendarAuditRecord: {
    findFirst: async () => null,
    create: async () => undefined,
  },
  $transaction: async (callback: (tx: typeof fixturePrisma) => unknown) => callback(fixturePrisma),
  privateTravelBlock: {
    upsert: async () => routeFixture.privateTravelBlock,
  },
  calendarSyncConflict: {
    findMany: async () => routeFixture.conflicts,
    findFirst: async () => routeFixture.conflicts[0] ?? null,
    update: async () => routeFixture.resolvedConflict,
  },
}
const routePrisma = new Proxy(fixturePrisma, {
  get(target, property, receiver) {
    if (useDatabaseRoute) return Reflect.get(databasePrisma, property, databasePrisma)
    return Reflect.get(target, property, receiver)
  },
})
const providerForConnection = async () => {
  routeFixture.providerLookupCalls += 1
  return routeFixture.provider
}
const enqueueCalendarSync = async () => routeFixture.enqueueResult
const executeCalendarSyncJob = async (jobId: string) => {
  routeFixture.syncExecutionCalls += 1
  if (routeFixture.syncError) throw routeFixture.syncError
  if (useDatabaseRoute) return routeFixture.syncResults.shift() ?? { succeeded: true }
  const index = Number(jobId.replace('job-', '')) - 1
  return routeFixture.syncResults[index] ?? { succeeded: true }
}

mock.module('@/auth', { namedExports: { auth } })
mock.module('@/lib/db', { namedExports: { prisma: routePrisma } })
mock.module('@/lib/calendar-server', { namedExports: { providerForConnection, executeCalendarSyncJob, enqueueCalendarSync } })

const calendarsRouteSource = readFileSync(
  new URL('../app/api/calendar/connections/[id]/calendars/route.ts', import.meta.url),
  'utf8',
)
const syncNowRouteSource = readFileSync(
  new URL('../app/api/calendar/connections/[id]/sync-now/route.ts', import.meta.url),
  'utf8',
)

const jsonResponse = (body: unknown, status = 200, headers?: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })

type FetchCall = { url: string; init?: RequestInit }
const json = jsonResponse
const queuedFetch = (responses: Response[], calls: FetchCall[]): typeof fetch =>
  (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init })
    const response = responses.shift()
    if (!response) throw new Error('Unexpected fixture request')
    return response
  }) as typeof fetch
const providerOptions = (requestFetch: typeof fetch, overrides: Record<string, unknown> = {}) => ({
  accessToken: 'fixture-token',
  refreshToken: 'fixture-refresh-token',
  clientId: 'fixture-client',
  clientSecret: 'fixture-secret',
  fetch: requestFetch,
  sleep: async () => undefined,
  ...overrides,
})

const resetRouteFixture = () => {
  routeFixture.session = { user: { id: 'user-1' } }
  routeFixture.connection = {
    id: 'connection-1',
    userId: 'user-1',
    status: 'active',
    disconnectedAt: null,
    settings: [],
  }
  routeFixture.provider = null
  routeFixture.syncResults = []
  routeFixture.syncError = null
  routeFixture.createdJobs = []
  routeFixture.providerLookupCalls = 0
  routeFixture.syncExecutionCalls = 0
  routeFixture.updates = []
  routeFixture.event = { id: 'event-1', userId: 'user-1' }
  routeFixture.person = { id: 'ckxxxxxxxxxxxxxxxxxxxxxxx', userId: 'user-1', email: 'person@example.test' }
  routeFixture.inviteDecision = null
  routeFixture.medicalConsent = null
  routeFixture.privateTravelBlock = null
  routeFixture.conflicts = []
  routeFixture.resolvedConflict = {}
  routeFixture.enqueueResult = { queued: true }
}

const assertSafeErrorResponse = async (
  response: Response,
  expected: { code: string; message: string; details?: unknown; status: number },
  unsafeValues: string[],
) => {
  assert.equal(response.status, expected.status)
  const body = await response.json()
  assert.deepEqual(body, {
    error: {
      code: expected.code,
      message: expected.message,
      ...(expected.details ? { details: expected.details } : {}),
    },
  })
  const serialized = JSON.stringify(body)
  for (const unsafeValue of unsafeValues) assert.doesNotMatch(serialized, new RegExp(unsafeValue, 'i'))
}

const assertSafeSuccessResponse = async (response: Response, expected: unknown, unsafeValues: string[]) => {
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.deepEqual(body, expected)
  const serialized = JSON.stringify(body)
  for (const unsafeValue of unsafeValues) assert.doesNotMatch(serialized, new RegExp(unsafeValue, 'i'))
}

describe('Google Calendar provider fixtures', () => {
  it('keeps authenticated database-backed calendar routes on their public allowlists', {
    skip: !databaseTestsEnabled && 'requires a disposable migrated database',
  }, async () => {
    const privateMarkers = [
      `calendar-private-user-${suffix}`,
      `calendar-private-email-${suffix}@example.test`,
      `calendar-private-connection-${suffix}`,
      `calendar-private-provider-account-${suffix}`,
      `calendar-private-credential-${suffix}`,
      `calendar-private-calendar-${suffix}`,
      `calendar-private-calendar-name-${suffix}`,
      `calendar-private-token-${suffix}`,
      `calendar-private-refresh-${suffix}`,
    ]

    const owner = await databasePrisma.user.create({
      data: {
        id: `calendar-route-owner-${suffix}`,
        email: `calendar-route-owner-${suffix}@example.test`,
        name: 'Calendar route owner',
      },
    })
    const user = await databasePrisma.user.create({
      data: {
        email: `database-account-email-${Date.now()}@example.test`,
        name: 'Database connection metadata',
      },
    })

    try {
      const account = await databasePrisma.account.create({
        data: {
          id: `database-credential-reference-${Date.now()}`,
          userId: user.id,
          type: 'oauth',
          provider: 'google',
          providerAccountId: 'database-provider-account',
          access_token: 'database-access-token',
          refresh_token: 'database-refresh-token',
          scope: 'openid email profile https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events',
        },
      })
      const connection = await databasePrisma.calendarProviderConnection.create({
        data: {
          userId: user.id,
          provider: 'google',
          providerAccountId: 'database-provider-account',
          displayName: 'Database connection metadata',
          status: 'synced',
          credentialReference: account.id,
          lastSyncError: 'database-connection-metadata',
          settings: {
            create: {
              externalCalendarId: 'calendar-acceptance',
              calendarName: 'Private database calendar name',
              direction: 'two_way',
              eventTypes: [],
            },
          },
        },
      })

      routeFixture.session = { user: { id: user.id } }
      routeFixture.provider = {
        listCalendars: async () => [{
          id: 'calendar-acceptance',
          name: 'Acceptance calendar',
          primary: true,
          accessRole: 'owner',
          access_token: 'database-access-token',
          refresh_token: 'database-refresh-token',
          providerAccountId: 'database-provider-account',
          credentialReference: account.id,
        }],
      }
      routeFixture.syncResults = [{
        succeeded: true,
        rescheduled: false,
        access_token: 'database-access-token',
        providerAccountId: 'database-provider-account',
        credentialReference: account.id,
      }]
      useDatabaseRoute = true

      const [{ GET }, { POST }] = await Promise.all([
        import('../app/api/calendar/connections/[id]/calendars/route.ts'),
        import('../app/api/calendar/connections/[id]/sync-now/route.ts'),
      ])

      const expectedNotFound = {
        code: 'NOT_FOUND',
        message: 'Calendar connection not found',
        status: 404,
      }
      await assertSafeSuccessResponse(
        await GET(new Request('http://localhost'), { params: Promise.resolve({ id: connection.id }) }),
        {
          calendars: [{
            id: 'calendar-acceptance',
            name: 'Acceptance calendar',
            primary: true,
            accessRole: 'owner',
          }],
        },
        privateMarkers,
      )

      const syncResponse = await POST(
        new Request('http://localhost', { method: 'POST' }),
        { params: Promise.resolve({ id: connection.id }) },
      )
      assert.equal(syncResponse.status, 200)
      const syncBody = await syncResponse.json() as {
        queued: boolean
        jobs: Array<{ id: string; externalCalendarId: string }>
        results: Array<{ succeeded: boolean; rescheduled: boolean }>
      }
      assert.equal(syncBody.queued, true)
      assert.equal(syncBody.jobs.length, 1)
      assert.deepEqual(syncBody.jobs[0], {
        id: syncBody.jobs[0].id,
        externalCalendarId: 'calendar-acceptance',
      })
      assert.deepEqual(syncBody.results, [{ succeeded: true, rescheduled: false }])
      const serializedSync = JSON.stringify(syncBody)

    const suffix = Date.now()
    const unsafeValues = [
      'provider description',
      'error_description',
      'access_token',
      'refresh_token',
      'providerAccountId',
      'account-123',
      'https://accounts.google.test',
      'redirect',
    ]
    const hostileFields = {
      access_token: 'secret',
      refresh_token: 'refresh-secret',
      providerAccountId: 'account-123',
      client_secret: 'client-secret',
      redirect: 'https://accounts.google.test/callback',
      providerMetadata: { region: 'google' },
    }

    routeFixture.enqueueResult = { queued: true, key: 'idempotency-secret', ...hostileFields }
    const retryRoute = await import('../app/api/calendar/events/[id]/retry/route.ts')
    await assertSafeSuccessResponse(
      await retryRoute.POST(new Request('http://localhost', { method: 'POST' }), { params: Promise.resolve({ id: 'event-1' }) }),
      { retry: { queued: true } },
      unsafeValues,
    )

    const detectedAt = new Date('2026-09-08T12:00:00.000Z')
    routeFixture.conflicts = [{
      id: 'conflict-1',
      eventId: 'event-1',
      connectionId: 'connection-secret',
      detectedAt,
      resolvedAt: null,
      resolution: null,
      event: { id: 'event-1', title: 'Safe title', ...hostileFields },
      connection: { id: 'connection-secret', provider: 'google', displayName: 'Work' },
      localVersion: {
        title: 'Safe title',
        startDatetime: '2026-09-08T13:00:00.000Z',
        endDatetime: '2026-09-08T14:00:00.000Z',
        allDay: false,
        ...hostileFields,
      },
      providerVersion: {
        title: 'Provider title',
        start: '2026-09-08T13:30:00.000Z',
        end: '2026-09-08T14:30:00.000Z',
        allDay: false,
        ...hostileFields,
      },
      ...hostileFields,
    }]
    const conflictsRoute = await import('../app/api/calendar/conflicts/route.ts')
    const snapshotShape = (title: string, start: string, end: string) => ({
      available: true,
      title,
      start,
      end,
      allDay: false,
      location: null,
      notes: null,
      recurrence: [],
      attendees: [],
      visibility: null,
      status: null,
      etag: null,
      reason: null,
    })
    await assertSafeSuccessResponse(
      await conflictsRoute.GET(),
      {
        conflicts: [{
          id: 'conflict-1',
          detectedAt: detectedAt.toISOString(),
          event: { id: 'event-1', title: 'Safe title' },
          connection: { provider: 'google', displayName: 'Work' },
          localSnapshot: snapshotShape('Safe title', '2026-09-08T13:00:00.000Z', '2026-09-08T14:00:00.000Z'),
          providerSnapshot: snapshotShape('Provider title', '2026-09-08T13:30:00.000Z', '2026-09-08T14:30:00.000Z'),
        }],
      },
      unsafeValues,
    )

    const resolvedAt = new Date('2026-09-08T12:30:00.000Z')
    routeFixture.resolvedConflict = {
      id: 'conflict-1',
      eventId: 'event-1',
      connectionId: 'connection-secret',
      resolution: 'keep_provider',
      resolvedAt,
      localVersion: hostileFields,
      providerVersion: hostileFields,
      ...hostileFields,
    }
    const resolveRoute = await import('../app/api/calendar/conflicts/[id]/resolve/route.ts')

    const startDatetime = new Date('2026-09-08T12:30:00.000Z')
    await assertSafeSuccessResponse(
      await resolveRoute.POST(
        new Request('http://localhost', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ resolution: 'keep_provider' }),
        }),
        { params: Promise.resolve({ id: 'conflict-1' }) },
      ),
      { conflict: { id: 'conflict-1', resolution: 'keep_provider', resolvedAt: resolvedAt.toISOString() } },
      unsafeValues,
    )
  })

  it('keeps invitee and medical-forwarding mutation responses credential-free', async () => {
    const unsafeValues = [
      'provider description',
      'error_description',
      'access_token',
      'refresh_token',
      'providerAccountId',
      'account-123',
      'https://accounts.google.test',
      'redirect',
    ]
    const hostileFields = {
      access_token: 'secret',
      refresh_token: 'refresh-secret',
      providerAccountId: 'account-123',
      client_secret: 'client-secret',
      redirect: 'https://accounts.google.test/callback',
      providerMetadata: { region: 'google' },
    }
    const personId = 'ckxxxxxxxxxxxxxxxxxxxxxxx'
    const publicDecision = {
      id: 'decision-hostile',
      eventId: 'event-1',
      personId,
      decision: 'manually_added',
      reason: null,
      invitationStatus: 'sent',
    }

    resetRouteFixture()
    routeFixture.inviteDecision = {
      ...publicDecision,
      providerInvitationId: 'provider-invitation-secret',
      ...hostileFields,
    }
    const inviteesRoute = await import('../app/api/calendar/events/[id]/invitees/route.ts')
    await assertSafeSuccessResponse(
      await inviteesRoute.POST(
        new Request('http://localhost', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ personId, decision: 'manually_added' }),
        }),
        { params: Promise.resolve({ id: 'event-1' }) },
      ),
      { decision: publicDecision, unchanged: true },
      unsafeValues,
    )

    resetRouteFixture()
    routeFixture.inviteDecision = {
      id: 'decision-hostile',
      eventId: 'event-1',
      personId,
      decision: 'manually_removed',
      reason: 'previous decision',
      invitationStatus: 'cancelled',
      providerInvitationId: 'provider-invitation-secret',
      ...hostileFields,
    }
    routeFixture.enqueueResult = { queued: true, key: 'idempotency-secret', ...hostileFields }
    await assertSafeSuccessResponse(
      await inviteesRoute.POST(
        new Request('http://localhost', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ personId, decision: 'manually_added' }),
        }),
        { params: Promise.resolve({ id: 'event-1' }) },
      ),
      {
        decision: { ...publicDecision, invitationStatus: 'pending' },
        notification: { queued: 1 },
        sync: { queued: true },
      },
      unsafeValues,
    )

    resetRouteFixture()
    routeFixture.event = {
      id: 'event-1',
      userId: 'user-1',
      type: 'medical',
      title: 'Sensitive appointment',
      startDatetime: new Date('2026-09-08T13:00:00.000Z'),
      endDatetime: new Date('2026-09-08T14:00:00.000Z'),
      location: 'Sensitive clinic',
      notes: 'Sensitive notes',
      tags: [],
      peopleRefs: [],
      syncVersion: 4,
      ...hostileFields,
    }
    const medicalRoute = await import('../app/api/calendar/events/[id]/medical-forwarding/route.ts')
    const previewResponse = await medicalRoute.POST(
      new Request('http://localhost', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ destinationCalendarId: 'calendar-1' }),
      }),
      { params: Promise.resolve({ id: 'event-1' }) },
    )
    assert.equal(previewResponse.status, 200)
    const previewBody = await previewResponse.json()
    assert.deepEqual(previewBody.preview, {
      title: 'Private appointment',
      startDatetime: '2026-09-08T13:00:00.000Z',
      endDatetime: '2026-09-08T14:00:00.000Z',
      location: null,
      notes: null,
      attendees: [],
      visibility: 'private',
      redacted: true,
    })
    for (const unsafeValue of unsafeValues) {
      assert.doesNotMatch(JSON.stringify(previewBody), new RegExp(unsafeValue, 'i'))
    }

    routeFixture.medicalConsent = {
      id: 'consent-1',
      connectionId: 'connection-secret',
      providerAccountId: 'account-123',
      consentSecret: 'consent-secret',
      ...hostileFields,
    }
    routeFixture.enqueueResult = { queued: true, key: 'idempotency-secret', ...hostileFields }
    await assertSafeSuccessResponse(
      await medicalRoute.POST(
        new Request('http://localhost', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            destinationCalendarId: 'calendar-1',
            confirm: true,
            previewHash: previewBody.previewHash,
          }),
        }),
        { params: Promise.resolve({ id: 'event-1' }) },
      ),
      {
        confirmed: true,
        eventId: 'event-1',
        sync: { queued: true },
      },
      unsafeValues,
    )
  })

  it('keeps successful calendar-list responses to the public allowlisted shape', async () => {
    resetRouteFixture()
    const { GET } = await import('../app/api/calendar/connections/[id]/calendars/route.ts')
    const unsafeValues = [
      'provider description',
      'error_description',
      'access_token',
      'refresh_token',
      'providerAccountId',
      'account-123',
      'https://accounts.google.test',
      'redirect',
    ]
    routeFixture.provider = {
      listCalendars: async () => [{
        id: 'calendar-1',
        name: 'Primary',
        primary: true,
        accessRole: 'owner',
        access_token: 'secret',
        refresh_token: 'refresh-secret',
        providerAccountId: 'account-123',
        client_secret: 'client-secret',
        redirect: 'https://accounts.google.test/callback',
        providerMetadata: { region: 'google' },
      }],
    }

    await assertSafeSuccessResponse(
      await GET(new Request('http://localhost'), { params: Promise.resolve({ id: 'connection-1' }) }),
      {
        calendars: [{
          id: 'calendar-1',
          name: 'Primary',
          primary: true,
          accessRole: 'owner',
        }],
      },
      unsafeValues,
    )
  })

  it('keeps successful sync-now responses to the public allowlisted shape', async () => {
    resetRouteFixture()
    const { POST } = await import('../app/api/calendar/connections/[id]/sync-now/route.ts')
    const unsafeValues = [
      'provider description',
      'error_description',
      'access_token',
      'refresh_token',
      'providerAccountId',
      'account-123',
      'https://accounts.google.test',
      'redirect',
    ]
    routeFixture.connection = {
      ...routeFixture.connection!,
      settings: [{ externalCalendarId: 'calendar-1', direction: 'two_way' }],
    }
    routeFixture.syncResults = [{
      succeeded: true,
      rescheduled: false,
      access_token: 'secret',
      refresh_token: 'refresh-secret',
      providerAccountId: 'account-123',
      client_secret: 'client-secret',
      redirect: 'https://accounts.google.test/callback',
      providerMetadata: { region: 'google' },
    }]

    await assertSafeSuccessResponse(
      await POST(new Request('http://localhost', { method: 'POST' }), { params: Promise.resolve({ id: 'connection-1' }) }),
      {
        queued: true,
        jobs: [{ id: 'job-1', externalCalendarId: 'calendar-1' }],
        results: [{ succeeded: true, rescheduled: false }],
      },
      unsafeValues,
    )
  })

  it('keeps the calendar-list route safe for reconnect and transient provider failures', async () => {
    resetRouteFixture()
    const { GET } = await import('../app/api/calendar/connections/[id]/calendars/route.ts')
    const unsafeValues = [
      'provider description',
      'error_description',
      'access_token',
      'refresh_token',
      'providerAccountId',
      'account-123',
      'https://accounts.google.test',
      'redirect',
    ]

    routeFixture.provider = {
      listCalendars: async () => {
        throw new CalendarProviderError(
          'provider description error_description=revoked access_token=secret providerAccountId=account-123 redirect=https://accounts.google.test',
          401,
        )
      },
    }
    await assertSafeErrorResponse(
      await GET(new Request('http://localhost'), { params: Promise.resolve({ id: 'connection-1' }) }),
      CALENDAR_PERMISSION_ERROR_CONTRACT.accessRevoked,
      unsafeValues,
    )
    const reconnectUpdate = routeFixture.updates[0]?.data as {
      status: string
      lastSyncError: string
    }
    assert.equal(reconnectUpdate.status, 'disabled')
    assert.equal(reconnectUpdate.lastSyncError, CALENDAR_PERMISSION_ERROR_CONTRACT.accessRevoked.message)

    resetRouteFixture()
    routeFixture.provider = {
      listCalendars: async () => {
        throw new CalendarProviderError(
          'provider description error_description=rate-limited access_token=secret providerAccountId=account-123 redirect=https://accounts.google.test',
          503,
          999999,
        )
      },
    }
    await assertSafeErrorResponse(
      await GET(new Request('http://localhost'), { params: Promise.resolve({ id: 'connection-1' }) }),
      {
        ...CALENDAR_PROVIDER_ERROR_CONTRACT.unavailable,
        details: { retryAfterSeconds: 3600 },
      },
      unsafeValues,
    )
    assert.equal(routeFixture.updates.length, 0)

    resetRouteFixture()
    routeFixture.provider = {
      listCalendars: async () => {
        throw new Error(
          'unexpected provider crash error_description=secret stack=provider-stack credentials=fixture-secret account-123 redirect=https://accounts.google.test',
        )
      },
    }
    await assertSafeErrorResponse(
      await GET(new Request('http://localhost'), { params: Promise.resolve({ id: 'connection-1' }) }),
      {
        ...CALENDAR_PROVIDER_ERROR_CONTRACT.unavailable,
        details: { retryAfterSeconds: 30 },
      },
      unsafeValues,
    )
  })

  it('keeps sync-now reconnect, transient, and mixed-job failures on the safe route contract', async () => {
    resetRouteFixture()
    const { POST } = await import('../app/api/calendar/connections/[id]/sync-now/route.ts')
    const unsafeValues = [
      'provider description',
      'error_description',
      'access_token',
      'refresh_token',
      'providerAccountId',
      'account-123',
      'https://accounts.google.test',
      'redirect',
    ]

    routeFixture.connection = {
      ...routeFixture.connection!,
      status: 'disabled',
      disconnectedAt: new Date('2026-09-08T00:00:00.000Z'),
      settings: [{ externalCalendarId: 'calendar-1', direction: 'two_way' }],
    }
    await assertSafeErrorResponse(
      await POST(new Request('http://localhost', { method: 'POST' }), { params: Promise.resolve({ id: 'connection-1' }) }),
      CALENDAR_PROVIDER_ERROR_CONTRACT.reconnectRequired,
      unsafeValues,
    )
    assert.equal(routeFixture.createdJobs.length, 0)

    resetRouteFixture()
    routeFixture.connection = {
      ...routeFixture.connection!,
      settings: [{ externalCalendarId: 'calendar-1', direction: 'two_way' }],
    }
    routeFixture.syncResults = [{
      succeeded: false,
      error: 'provider description error_description=temporary access_token=secret providerAccountId=account-123 redirect=https://accounts.google.test',
    }]
    await assertSafeErrorResponse(
      await POST(new Request('http://localhost', { method: 'POST' }), { params: Promise.resolve({ id: 'connection-1' }) }),
      {
        ...CALENDAR_PROVIDER_ERROR_CONTRACT.unavailable,
        details: { retryAfterSeconds: 30 },
      },
      unsafeValues,
    )

    resetRouteFixture()
    routeFixture.connection = {
      ...routeFixture.connection!,
      settings: [
        { externalCalendarId: 'calendar-1', direction: 'two_way' },
        { externalCalendarId: 'calendar-2', direction: 'two_way' },
      ],
    }
    routeFixture.syncResults = [
      { succeeded: true },
      {
        succeeded: false,
        error: 'provider description error_description=mixed access_token=secret providerAccountId=account-123 redirect=https://accounts.google.test',
      },
    ]
    await assertSafeErrorResponse(
      await POST(new Request('http://localhost', { method: 'POST' }), { params: Promise.resolve({ id: 'connection-1' }) }),
      {
        ...CALENDAR_PROVIDER_ERROR_CONTRACT.unavailable,
        details: { retryAfterSeconds: 30 },
      },
      unsafeValues,
    )
    assert.equal(routeFixture.createdJobs.length, 2)

    resetRouteFixture()
    routeFixture.connection = {
      ...routeFixture.connection!,
      settings: [{ externalCalendarId: 'calendar-1', direction: 'two_way' }],
    }
    routeFixture.syncError = new Error(
      'unexpected provider crash error_description=secret stack=provider-stack credentials=fixture-secret account-123 redirect=https://accounts.google.test',
    )
    await assertSafeErrorResponse(
      await POST(new Request('http://localhost', { method: 'POST' }), { params: Promise.resolve({ id: 'connection-1' }) }),
      {
        ...CALENDAR_PROVIDER_ERROR_CONTRACT.unavailable,
        details: { retryAfterSeconds: 30 },
      },
      unsafeValues,
    )
  })

  it('keeps Events calendar-loading and retry failures on a safe route contract', () => {
    assert.deepEqual(calendarProviderErrorContract(401), CALENDAR_PROVIDER_ERROR_CONTRACT.reconnectRequired)
    assert.deepEqual(calendarProviderErrorContract(503, 0.001), {
      ...CALENDAR_PROVIDER_ERROR_CONTRACT.unavailable,
      details: { retryAfterSeconds: 1 },
    })
    assert.deepEqual(calendarProviderErrorContract(503, 999999), {
      ...CALENDAR_PROVIDER_ERROR_CONTRACT.unavailable,
      details: { retryAfterSeconds: 3600 },
    })

    const serializedContract = JSON.stringify(CALENDAR_PROVIDER_ERROR_CONTRACT)
    for (const unsafeValue of [
      'error_description',
      'access_token',
      'refresh_token',
      'providerAccountId',
      'callbackUrl',
      'redirect',
    ]) {
      assert.doesNotMatch(serializedContract, new RegExp(unsafeValue, 'i'))
    }
    assert.match(calendarsRouteSource, /calendarProviderErrorContract/)
    assert.match(syncNowRouteSource, /calendarProviderErrorContract/)
    assert.match(calendarsRouteSource, /CALENDAR_CONNECTION_ERROR_CONTRACT\.unauthorized/)
    assert.match(syncNowRouteSource, /CALENDAR_CONNECTION_ERROR_CONTRACT\.unauthorized/)
    assert.doesNotMatch(calendarsRouteSource, /providerError\.message|lastSyncError: error\.message/)
    assert.doesNotMatch(syncNowRouteSource, /return apiSuccess\([^)]*error/)
  })

  it('normalises malformed provider retry hints without exposing provider details', () => {
    const providerMessage =
      'provider-secret error_description=quota access_token=secret providerAccountId=account-123'
    const cases = [
      { label: 'negative', retryAfter: -17, expected: 1 },
      { label: 'NaN', retryAfter: Number.NaN, expected: 30 },
      { label: 'infinite', retryAfter: Number.POSITIVE_INFINITY, expected: 30 },
      { label: 'missing', retryAfter: undefined, expected: 30 },
    ]

    for (const fixture of cases) {
      const providerError = new CalendarProviderError(providerMessage, 503, fixture.retryAfter)
      const contract = calendarProviderErrorContract(providerError.status, providerError.retryAfter)

      assert.deepEqual(contract, {
        ...CALENDAR_PROVIDER_ERROR_CONTRACT.unavailable,
        details: { retryAfterSeconds: fixture.expected },
      }, fixture.label)
      assert.ok(contract.details.retryAfterSeconds >= 1, fixture.label)
      assert.ok(contract.details.retryAfterSeconds <= 3600, fixture.label)

      const serialized = JSON.stringify(contract)
      assert.doesNotMatch(serialized, /provider-secret|error_description|access_token|providerAccountId|account-123/i)
      assert.doesNotMatch(serialized, /NaN|Infinity|-17/)
    }
  })

  it('uses sync cursors and maps recurrence and attendees', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = []
    const provider = new GoogleCalendarProvider(providerOptions(
      queuedFetch([json({ error: 'invalid_grant' }, 400)], calls),
      { expiresAt: new Date(0) },
    ))

    const page = await provider.listEvents('primary', 'cursor-before-delete')
    assert.match(requests[0].url, /syncToken=cursor-1/)
    assert.equal(page.cursor, 'cursor-2')
    const event = page.events[0]
    assert.notEqual(event.status, 'cancelled')
    if (event.status === 'cancelled') assert.fail('Expected a complete provider event')
    assert.deepEqual(event.recurrence, ['RRULE:FREQ=WEEKLY'])
    assert.deepEqual(event.attendees, ['guest@example.test'])
    assert.equal(event.visibility, 'private')
  })

  it('maps id-and-status-only incremental cancellation tombstones', async () => {
    const provider = new GoogleCalendarProvider(providerOptions(
      queuedFetch([json({ error: 'invalid_grant' }, 400)], calls),
      { expiresAt: new Date(0) },
    ))

    const page = await provider.listEvents('primary', 'cursor-before-delete')
    assert.deepEqual(page.events, [{
      id: 'remote-deleted',
      etag: '"deleted-etag"',
      status: 'cancelled',
      updatedAt: new Date('2026-09-08T11:00:00.000Z'),
    }])
    assert.equal(page.cursor, 'cursor-after-delete')
  })

  it('sends etags and explicit guest updates on provider writes', async () => {
    let request: { url: string; init?: RequestInit } | undefined
    const provider = new GoogleCalendarProvider(providerOptions(
      queuedFetch([json({ error: 'invalid_grant' }, 400)], calls),
      { expiresAt: new Date(0) },
    ))

    await provider.upsertEvent('primary', {
      id: 'event-1',
      etag: '"old-etag"',
      status: 'confirmed',
      title: 'Conference',
      start: new Date('2026-10-05T18:30:00.000Z'),
      end: new Date('2026-10-05T19:30:00.000Z'),
      allDay: false,
      attendees: ['guest@example.com'],
      visibility: 'private',
      sendUpdates: 'none',
    })

    assert.equal(new URL(calls[0].url).searchParams.get('sendUpdates'), 'none')
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)).attendees, [{ email: 'guest@example.com' }])
  })

  it('fetches full conflict snapshots and notifies guests on cancellation', async () => {
    const calls: FetchCall[] = []
    const provider = new GoogleCalendarProvider(providerOptions(
      queuedFetch([json({ error: 'invalid_grant' }, 400)], calls),
      { expiresAt: new Date(0) },
    ))

    await provider.upsertEvent('primary', {
      id: 'event-1',
      etag: '"old-etag"',
      status: 'confirmed',
      title: 'Conference',
      start: new Date('2026-10-05T18:30:00.000Z'),
      end: new Date('2026-10-05T19:30:00.000Z'),
      allDay: false,
      attendees: ['guest@example.com'],
      visibility: 'private',
      sendUpdates: 'none',
    })

    assert.equal(new URL(calls[0].url).searchParams.get('sendUpdates'), 'none')
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)).attendees, [{ email: 'guest@example.com' }])
  })

  it('fetches full conflict snapshots and notifies guests on cancellation', async () => {
    const calls: FetchCall[] = []
    const provider = new GoogleCalendarProvider(providerOptions(
      queuedFetch([json({ error: 'invalid_grant' }, 400)], calls),
      { expiresAt: new Date(0) },
    ))

    const remote = await provider.getEvent('primary', 'event-1')
    assert.notEqual(remote.status, 'cancelled')
    if (remote.status === 'cancelled') assert.fail('Expected a complete provider event')
    await provider.cancelEvent('primary', 'event-1', '"provider-etag"')
    assert.equal(remote.title, 'Provider edit')
    assert.equal(new URL(calls[1].url).searchParams.get('sendUpdates'), 'all')
    assert.equal(new Headers(calls[1].init?.headers).get('if-match'), '"provider-etag"')
  })

  it('refreshes an expired token, retries transient failures, and persists refresh output', async () => {
    const calls: FetchCall[] = []
    let refreshed = ''
    const provider = new GoogleCalendarProvider(providerOptions(
      queuedFetch([json({ error: 'invalid_grant' }, 400)], calls),
      { expiresAt: new Date(0) },
    ))

    assert.deepEqual(await provider.listCalendars(), [])
    assert.equal(refreshed, 'fresh-token')
    assert.equal(calls.filter(call => call.includes('/calendarList')).length, 2)
  })

  it('treats an already-revoked token as disconnected and reports other revocation failures safely', async () => {
    const accepted = new GoogleCalendarProvider({
      accessToken: 'fixture-token',
      refreshToken: 'refresh-token',
      clientId: 'fixture-client',
      clientSecret: 'fixture-secret',
      fetch: async () => new Response('', { status: 400 }),
    })
    await accepted.revoke()

    const failed = new GoogleCalendarProvider({
      accessToken: 'fixture-token',
      refreshToken: 'refresh-token',
      clientId: 'fixture-client',
      clientSecret: 'fixture-secret',
      fetch: async () => new Response('', { status: 500 }),
    })
    await assert.rejects(
      () => failed.revoke(),
      (error: unknown) => error instanceof CalendarProviderError && error.status === 500,
    )
  })

  it('treats refresh invalid_grant as a permanent reconnect condition', async () => {
    const calls: FetchCall[] = []
    const provider = new GoogleCalendarProvider(providerOptions(
      queuedFetch([json({ error: 'invalid_grant' }, 400)], calls),
      { expiresAt: new Date(0) },
    ))

    await assert.rejects(
      provider.listCalendars(),
      error => error instanceof CalendarProviderError && error.status === 401,
    )
    assert.equal(calls.length, 1)
    assert.equal(new URL(calls[0].url).pathname, '/token')
  })
})

    const endDatetime = new Date('2026-09-08T13:00:00.000Z')

      const ownerConnection = await databasePrisma.calendarProviderConnection.create({
        data: {
          id: `calendar-owner-connection-${suffix}`,
          userId: owner.id,
          provider: 'google',
          providerAccountId: `calendar-owner-provider-account-${suffix}`,
          status: 'synced',
          settings: {
            create: {
              externalCalendarId: `calendar-owner-calendar-${suffix}`,
              calendarName: 'Owner calendar',
              direction: 'two_way',
              eventTypes: [],
            },
          },
        },
      })

      const otherAccount = await databasePrisma.account.create({
        data: {
          id: privateMarkers[4],
          userId: otherUser.id,
          type: 'oauth',
          provider: 'google',
          providerAccountId: privateMarkers[3],
          access_token: privateMarkers[7],
          refresh_token: privateMarkers[8],
          scope: 'openid email profile https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events',
        },
      })

      const otherConnection = await databasePrisma.calendarProviderConnection.create({
        data: {
          id: privateMarkers[2],
          userId: otherUser.id,
          provider: 'google',
          providerAccountId: privateMarkers[3],
          displayName: privateMarkers[6],
          status: 'synced',
          credentialReference: otherAccount.id,
          settings: {
            create: {
              externalCalendarId: privateMarkers[5],
              calendarName: privateMarkers[6],
              direction: 'two_way',
              eventTypes: [],
            },
          },
        },
      })

    const otherUser = await databasePrisma.user.create({
      data: {
        id: privateMarkers[0],
        email: privateMarkers[1],
        name: 'Calendar private user',
      },
    })
