import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { prisma } from '../lib/db.ts'
import { GOOGLE_CALENDAR_AUTH_SCOPE } from '../lib/calendar-scopes.ts'

const databaseTestsEnabled = process.env.CALENDAR_CONNECTION_DATABASE_TESTS === '1'
const routeSession = { userId: '' }

mock.module('@/auth', {
  namedExports: {
    auth: async () => routeSession.userId
      ? { user: { id: routeSession.userId } }
      : null,
  },
})
mock.module('@/lib/db', { namedExports: { prisma } })

const connectRequest = () => new Request('http://localhost/api/calendar/connections', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ provider: 'google', displayName: 'Restored Google Calendar' }),
})

function assertPublicConnection(value: unknown, expectedId: string) {
  assert.ok(value && typeof value === 'object')
  const connection = value as Record<string, unknown>
  assert.equal(connection.id, expectedId)
  for (const privateField of ['userId', 'providerAccountId', 'credentialReference']) {
    assert.equal(privateField in connection, false, `${privateField} must not cross the route boundary`)
  }
}

describe('Calendar connection database acceptance', { skip: !databaseTestsEnabled }, () => {
  it('reuses a migrated connection and preserves its settings across repeated callbacks', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const userId = `calendar-reconnect-owner-${suffix}`
    const providerAccountId = `calendar-provider-account-${suffix}`
    const credentialReference = `calendar-credential-${suffix}`

    await prisma.user.create({
      data: { id: userId, email: `${userId}@example.test`, name: 'Calendar reconnect owner' },
    })

    try {
      await prisma.account.create({
        data: {
          id: credentialReference,
          userId,
          type: 'oauth',
          provider: 'google',
          providerAccountId,
          access_token: `calendar-access-${suffix}`,
          refresh_token: `calendar-refresh-${suffix}`,
          scope: GOOGLE_CALENDAR_AUTH_SCOPE,
        },
      })
      const migrated = await prisma.calendarProviderConnection.create({
        data: {
          userId,
          provider: 'google',
          providerAccountId,
          displayName: 'Legacy Google Calendar',
          status: 'disabled',
          credentialReference: null,
          disconnectedAt: new Date('2026-09-01T00:00:00.000Z'),
          lastSyncError: 'Legacy connection requires restoration',
          settings: {
            create: {
              externalCalendarId: `calendar-${suffix}`,
              calendarName: 'Private calendar',
              direction: 'provider_to_app',
              eventTypes: ['appointment'],
              enabled: false,
            },
          },
        },
      })

      routeSession.userId = userId
      const { GET, POST } = await import('../app/api/calendar/connections/route.ts')

      const firstResponse = await POST(connectRequest())
      const secondResponse = await POST(connectRequest())
      assert.equal(firstResponse.status, 201)
      assert.equal(secondResponse.status, 201)
      const first = await firstResponse.json()
      const second = await secondResponse.json()
      assertPublicConnection(first, migrated.id)
      assertPublicConnection(second, migrated.id)

      const listResponse = await GET()
      assert.equal(listResponse.status, 200)
      const listed = await listResponse.json() as Array<Record<string, unknown>>
      assert.equal(listed.length, 1)
      assertPublicConnection(listed[0], migrated.id)
      const settings = listed[0].settings as Array<Record<string, unknown>>
      assert.equal(settings.length, 1)
      assert.deepEqual({
        externalCalendarId: settings[0].externalCalendarId,
        calendarName: settings[0].calendarName,
        direction: settings[0].direction,
        eventTypes: settings[0].eventTypes,
        enabled: settings[0].enabled,
      }, {
        externalCalendarId: `calendar-${suffix}`,
        calendarName: 'Private calendar',
        direction: 'provider_to_app',
        eventTypes: ['appointment'],
        enabled: false,
      })

      assert.equal(await prisma.calendarProviderConnection.count({ where: { userId, provider: 'google' } }), 1)
      const persisted = await prisma.calendarProviderConnection.findUniqueOrThrow({
        where: { id: migrated.id },
        include: { settings: true },
      })
      assert.equal(persisted.credentialReference, credentialReference)
      assert.equal(persisted.providerAccountId, providerAccountId)
      assert.equal(persisted.status, 'pending')
      assert.equal(persisted.disconnectedAt, null)
      assert.equal(persisted.lastSyncError, null)
      assert.equal(persisted.settings.length, 1)

      const serializedResponses = JSON.stringify([first, second, listed])
      for (const privateValue of [userId, providerAccountId, credentialReference, `calendar-access-${suffix}`, `calendar-refresh-${suffix}`]) {
        assert.doesNotMatch(serializedResponses, new RegExp(privateValue))
      }
    } finally {
      routeSession.userId = ''
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined)
    }
  })
})