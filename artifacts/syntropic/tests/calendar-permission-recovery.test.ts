import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { CALENDAR_PERMISSION_ERROR_CONTRACT } from '../lib/calendar-oauth-server.ts'

const eventsSource = readFileSync(new URL('../app/(app)/events/events-client.tsx', import.meta.url), 'utf8')
const calendarsRouteSource = readFileSync(new URL('../app/api/calendar/connections/[id]/calendars/route.ts', import.meta.url), 'utf8')
const syncRouteSource = readFileSync(new URL('../app/api/calendar/connections/[id]/sync-now/route.ts', import.meta.url), 'utf8')
const oauthServerSource = readFileSync(new URL('../lib/calendar-oauth-server.ts', import.meta.url), 'utf8')

describe('Calendar permission recovery contract', () => {
  it('uses safe, distinct server codes and messages', () => {
    assert.deepEqual(Object.keys(CALENDAR_PERMISSION_ERROR_CONTRACT), ['consentRequired', 'accessExpired', 'accessRevoked'])
    assert.equal(CALENDAR_PERMISSION_ERROR_CONTRACT.consentRequired.code, 'CALENDAR_CONSENT_REQUIRED')
    assert.equal(CALENDAR_PERMISSION_ERROR_CONTRACT.accessExpired.code, 'CALENDAR_ACCESS_EXPIRED')
    assert.equal(CALENDAR_PERMISSION_ERROR_CONTRACT.accessRevoked.code, 'CALENDAR_ACCESS_REVOKED')
    for (const error of Object.values(CALENDAR_PERMISSION_ERROR_CONTRACT)) {
      assert.doesNotMatch(error.message, /error_description|access_token|refresh_token|providerAccountId/i)
    }
  })

  it('maps each safe code to static Events guidance and retries consent', () => {
    for (const code of ['CALENDAR_CONSENT_REQUIRED', 'CALENDAR_ACCESS_EXPIRED', 'CALENDAR_ACCESS_REVOKED']) {
      assert.match(eventsSource, new RegExp(code))
    }
    assert.match(eventsSource, /onClick=\{createGoogleConnection\}/)
    assert.match(calendarsRouteSource, /CALENDAR_PERMISSION_ERROR_CONTRACT\.accessRevoked/)
    assert.match(syncRouteSource, /CALENDAR_PERMISSION_ERROR_CONTRACT\.accessExpired/)
    assert.match(syncRouteSource, /CALENDAR_PERMISSION_ERROR_CONTRACT\.accessRevoked/)
  })

  it('keeps the staging recovery probe explicitly non-production and privacy-safe', () => {
    assert.match(oauthServerSource, /CALENDAR_RECOVERY_STAGING !== '1'/)
    assert.match(oauthServerSource, /CALENDAR_RECOVERY_STAGING_ENVIRONMENT !== 'NON_PRODUCTION'/)
    assert.match(oauthServerSource, /x-syntropic-calendar-recovery/)
    assert.match(calendarsRouteSource, /stagingCalendarRecoveryFailure\(_req, 'list-calendars'\)/)
    assert.match(syncRouteSource, /stagingCalendarRecoveryFailure\(_request, 'sync-now'\)/)
    assert.doesNotMatch(oauthServerSource, /console\.error\([^)]*error\b/)
  })
})