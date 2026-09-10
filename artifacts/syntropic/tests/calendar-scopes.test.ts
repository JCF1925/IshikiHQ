import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  GOOGLE_CALENDAR_AUTH_SCOPE,
  GOOGLE_CALENDAR_OAUTH_SCOPES,
  hasGoogleCalendarScopes,
  selectGoogleCalendarAccount,
} from '../lib/calendar-scopes.ts'

describe('Google Calendar OAuth credential selection', () => {
  const complete = {
    id: 'account-complete',
    provider: 'google',
    access_token: 'access',
    refresh_token: 'refresh',
    scope: GOOGLE_CALENDAR_AUTH_SCOPE,
  }

  it('requests and requires both minimal Calendar grants', () => {
    assert.equal(hasGoogleCalendarScopes(GOOGLE_CALENDAR_AUTH_SCOPE), true)
    assert.equal(hasGoogleCalendarScopes(`openid ${GOOGLE_CALENDAR_OAUTH_SCOPES[0]}`), false)
  })

  it('selects only owned, refreshable, scope-complete Google credentials', () => {
    const missingRefresh = { ...complete, id: 'missing-refresh', refresh_token: null }
    const missingScope = { ...complete, id: 'missing-scope', scope: 'openid email profile' }
    assert.equal(selectGoogleCalendarAccount([missingRefresh, missingScope]), null)
    assert.equal(selectGoogleCalendarAccount([missingRefresh, complete])?.id, complete.id)
    assert.equal(selectGoogleCalendarAccount([complete], 'another-account'), null)
  })
})