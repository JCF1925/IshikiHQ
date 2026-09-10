import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { exactPreviewMatches, outgoingCalendarEventPreview, stableIdempotencyKey } from '../lib/calendar-core.ts'
import { GoogleCalendarProvider } from '../lib/calendar-provider.ts'
import { GOOGLE_CALENDAR_AUTH_SCOPE, selectGoogleCalendarAccount } from '../lib/calendar-scopes.ts'
import {
  CALENDAR_CONNECTION_ERROR_CONTRACT,
  calendarOAuthCancellationCallback,
  publicCalendarConnection,
} from '../lib/calendar-oauth-server.ts'

const calendarConnectionsRouteSource = readFileSync(
  new URL('../app/api/calendar/connections/route.ts', import.meta.url),
  'utf8',
)
const calendarSchemaSource = readFileSync(
  new URL('../prisma/schema.prisma', import.meta.url),
  'utf8',
)
const calendarIdentityMigrationSource = readFileSync(
  new URL('../prisma/migrations/20261016000000_calendar_connection_identity/migration.sql', import.meta.url),
  'utf8',
)

describe('Google Calendar connection acceptance flow', () => {
  it('keeps connection errors stable and safe for the Events retry UI', () => {
    assert.deepEqual(CALENDAR_CONNECTION_ERROR_CONTRACT.unauthorized, {
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
      status: 401,
    })
    assert.deepEqual(CALENDAR_CONNECTION_ERROR_CONTRACT.missingGrant, {
      code: 'CONFLICT',
      message: 'Google Calendar access was not granted. You can try again whenever you’re ready.',
      status: 409,
      details: { connectRequired: true },
    })

    const serializedErrors = JSON.stringify(CALENDAR_CONNECTION_ERROR_CONTRACT)
    for (const unsafeValue of [
      'error_description',
      'access_token',
      'refresh_token',
      'providerAccountId',
      'callbackUrl',
      'redirect',
    ]) {
      assert.doesNotMatch(serializedErrors, new RegExp(unsafeValue, 'i'))
    }

    assert.match(calendarConnectionsRouteSource, /CALENDAR_CONNECTION_ERROR_CONTRACT\.unauthorized/)
    assert.match(calendarConnectionsRouteSource, /CALENDAR_CONNECTION_ERROR_CONTRACT\.missingGrant/)
    assert.match(calendarConnectionsRouteSource, /publicCalendarConnection/)
  })

  it('keeps connection API records safe for the Events loader', () => {
    const safe = publicCalendarConnection({
      id: 'connection-1',
      provider: 'google',
      displayName: 'Google Calendar',
      status: 'pending',
      deletionPolicy: 'mark_cancelled',
      connectedAt: new Date('2026-09-09T00:00:00.000Z'),
      disconnectedAt: null,
      lastSyncedAt: null,
      lastSyncError: null,
      createdAt: new Date('2026-09-09T00:00:00.000Z'),
      updatedAt: new Date('2026-09-09T00:00:00.000Z'),
      settings: [{ externalCalendarId: 'primary' }],
      userId: 'user-secret',
      providerAccountId: 'google-account-secret',
      credentialReference: 'account-secret',
    } as never)

    assert.deepEqual(safe, {
      id: 'connection-1',
      provider: 'google',
      displayName: 'Google Calendar',
      status: 'pending',
      deletionPolicy: 'mark_cancelled',
      connectedAt: new Date('2026-09-09T00:00:00.000Z'),
      disconnectedAt: null,
      lastSyncedAt: null,
      lastSyncError: null,
      createdAt: new Date('2026-09-09T00:00:00.000Z'),
      updatedAt: new Date('2026-09-09T00:00:00.000Z'),
      settings: [{ externalCalendarId: 'primary' }],
    })
    const serialized = JSON.stringify(safe)
    for (const unsafeValue of ['user-secret', 'google-account-secret', 'account-secret', 'credentialReference', 'providerAccountId']) {
      assert.doesNotMatch(serialized, new RegExp(unsafeValue, 'i'))
    }
  })

  it('returns only the known Events callback to a recoverable cancellation state', () => {
    assert.equal(
      calendarOAuthCancellationCallback('/events?calendarOAuth=complete'),
      '/events?calendarOAuth=cancelled',
    )
    assert.equal(
      calendarOAuthCancellationCallback('/events?calendarOAuth=complete&view=list#today'),
      '/events?calendarOAuth=cancelled&view=list#today',
    )
    assert.equal(calendarOAuthCancellationCallback('/login?callbackUrl=%2Fevents'), null)
    assert.equal(calendarOAuthCancellationCallback('https://example.com/events?calendarOAuth=complete'), null)
    assert.equal(calendarOAuthCancellationCallback('//example.com/events?calendarOAuth=complete'), null)
  })

  it('connects a scope-complete account, selects a calendar, and queues an exact confirmed activation once', async () => {
    const account = selectGoogleCalendarAccount([{
      id: 'google-account',
      provider: 'google',
      access_token: 'access',
      refresh_token: 'refresh',
      scope: GOOGLE_CALENDAR_AUTH_SCOPE,
    }])
    assert.ok(account)

    const provider = new GoogleCalendarProvider({
      accessToken: account.access_token!,
      refreshToken: account.refresh_token,
      expiresAt: new Date(Date.now() + 60 * 60_000),
      clientId: 'fixture-client',
      clientSecret: 'fixture-secret',
      fetch: async () => new Response(JSON.stringify({
        items: [{ id: 'primary@example.com', summary: 'Primary', primary: true, accessRole: 'owner' }],
      }), { status: 200, headers: { 'content-type': 'application/json' } }),
    })
    const [calendar] = await provider.listCalendars()
    assert.deepEqual(calendar, {
      id: 'primary@example.com',
      name: 'Primary',
      primary: true,
      accessRole: 'owner',
    })

    const preview = outgoingCalendarEventPreview({
      id: 'event-1',
      type: 'personal',
      title: 'Fixture event',
      startDatetime: new Date('2026-09-08T01:00:00.000Z'),
      endDatetime: new Date('2026-09-08T02:00:00.000Z'),
      location: 'Home',
      notes: 'Exact outgoing payload',
      tags: [],
      peopleRefs: [],
      attendeeEmails: ['guest@example.com'],
    })
    const confirmedPreview = JSON.parse(JSON.stringify(preview))
    assert.equal(exactPreviewMatches(JSON.parse(JSON.stringify(preview)), confirmedPreview), true)

    const queued = new Set<string>()
    const key = stableIdempotencyKey(['google-activation', account.id, calendar.id, JSON.stringify(confirmedPreview)])
    assert.equal(queued.has(key), false)
    queued.add(key)
    assert.equal(queued.has(key), true)
  })

  it('stops before connection when Calendar scope or refresh credentials are missing', () => {
    assert.equal(selectGoogleCalendarAccount([{
      id: 'identity-only',
      provider: 'google',
      access_token: 'access',
      refresh_token: 'refresh',
      scope: 'openid email profile',
    }]), null)
    assert.equal(selectGoogleCalendarAccount([{
      id: 'no-offline-access',
      provider: 'google',
      access_token: 'access',
      refresh_token: null,
      scope: GOOGLE_CALENDAR_AUTH_SCOPE,
    }]), null)
  })

  it('documents and enforces provider-specific connection identity rules', () => {
    assert.match(calendarSchemaSource, /model CalendarProviderConnection/)
    assert.match(calendarSchemaSource, /providerAccountId\s+String\?/)
    assert.match(calendarSchemaSource, /partial unique index is maintained/)
    assert.match(calendarIdentityMigrationSource, /"provider" = 'google'[\s\S]*"providerAccountId" IS NULL/)
    assert.match(calendarIdentityMigrationSource, /CalendarProviderConnection_google_providerAccountId_check/)
    assert.match(calendarIdentityMigrationSource, /WHERE "providerAccountId" IS NULL/)
    assert.match(calendarIdentityMigrationSource, /"providerAccountId" = 'legacy:' \|\| "id"/)
  })
})