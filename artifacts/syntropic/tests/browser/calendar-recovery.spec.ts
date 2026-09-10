import { test, expect, type Page, type Route } from '@playwright/test'

const connectionId = 'calendar-recovery-connection'
const providerLeak = 'invalid_grant for calendar-owner@example.com access_token=provider-secret'
const savedSetting = {
  id: 'calendar-recovery-setting',
  externalCalendarId: 'primary-calendar-id',
  calendarName: 'Primary',
  direction: 'provider_to_syntropic',
  eventTypes: ['medical'],
  enabled: true,
}

const scenarios = [
  {
    name: 'missing consent',
    actionLabel: 'Connect Google Calendar',
    guidance: 'Google Calendar access is needed. Connect Google Calendar to continue.',
    error: {
      code: 'CONFLICT',
      message: 'Google Calendar access was not granted for calendar-owner@example.com.',
      details: { connectRequired: true, providerAccountId: 'google-account-123' },
    },
  },
  {
    name: 'expired access',
    actionLabel: 'Reconnect Google Calendar',
    guidance: 'Google Calendar access has expired. Reconnect Google Calendar to continue.',
    error: {
      code: 'CALENDAR_ACCESS_EXPIRED',
      message: 'Google Calendar access has expired for calendar-owner@example.com.',
      details: { reconnectRequired: true, providerAccountId: 'google-account-123' },
    },
  },
  {
    name: 'revoked access',
    actionLabel: 'Reconnect Google Calendar',
    guidance: 'Google Calendar access was revoked. Reconnect Google Calendar to continue.',
    error: {
      code: 'CALENDAR_ACCESS_REVOKED',
      message: 'Google Calendar access was revoked for calendar-owner@example.com.',
      details: { reconnectRequired: true, providerAccountId: 'google-account-123' },
    },
  },
] as const

async function json(route: Route, status: number, body: unknown) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

async function installCalendarRecoveryRoutes(page: Page, scenario: (typeof scenarios)[number]) {
  await page.route('**/api/**', async (route) => {
    const requestUrl = new URL(route.request().url())
    const { pathname } = requestUrl

    if (pathname === '/api/events' && route.request().method() === 'GET') {
      await json(route, 200, [])
      return
    }
    if (pathname === '/api/events/annual' && route.request().method() === 'GET') {
      await json(route, 200, [])
      return
    }
    if (pathname === '/api/calendar/connections' && route.request().method() === 'GET') {
      await json(route, 200, [{
        id: connectionId,
        provider: 'google',
        displayName: 'Google Calendar',
        status: 'connected',
      }])
      return
    }
    if (pathname === '/api/calendar/conflicts' && route.request().method() === 'GET') {
      await json(route, 200, { conflicts: [] })
      return
    }
    if (pathname === '/api/calendar/invite-rules' && route.request().method() === 'GET') {
      await json(route, 200, { rules: [] })
      return
    }
    if (pathname === `/api/calendar/connections/${connectionId}/calendars`) {
      await json(route, 409, { error: { ...scenario.error, message: providerLeak } })
      return
    }
    if (pathname === `/api/calendar/connections/${connectionId}/settings` && route.request().method() === 'GET') {
      await json(route, 200, { settings: [] })
      return
    }
    if (pathname === '/api/calendar/token' && route.request().method() === 'GET') {
      await json(route, 200, { url: 'https://calendar.example.test/ishiki.ics' })
      return
    }
    if (pathname === '/api/auth/signin/google') {
      // Stop the test at the boundary of the real Google consent flow. The
      // request itself proves the recovery action uses the existing flow.
      await json(route, 200, { url: '/events' })
      return
    }

    await route.fallback()
  })
}

for (const scenario of scenarios) {
  test(`Events recovers from ${scenario.name} without exposing provider details`, async ({ page }) => {
    await installCalendarRecoveryRoutes(page, scenario)
    await page.goto('/events')

    await expect(page.getByRole('heading', { name: 'Events & Calendar', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Sync', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Calendar sync' })).toBeVisible()
    const recoveryAlert = page.getByRole('alert').filter({ hasText: scenario.guidance })
    await expect(recoveryAlert).toBeVisible()
    await expect(recoveryAlert).toContainText(scenario.guidance)
    await expect(page.locator('body')).not.toContainText(providerLeak)
    await expect(page.locator('body')).not.toContainText('calendar-owner@example.com')
    await expect(page.locator('body')).not.toContainText('google-account-123')

    const consentRequest = page.waitForRequest((request) => {
      const requestUrl = new URL(request.url())
      return requestUrl.pathname === '/api/auth/signin/google'
    })
    await recoveryAlert.getByRole('button', { name: scenario.actionLabel, exact: true }).click()

    const request = await consentRequest
    expect(request.method()).toBe('POST')
  })
}

test('Events completes Calendar reconnection and replaces a removed target without losing sync scope', async ({ page }) => {
  let reconnected = false
  let replacementBody: Record<string, unknown> | null = null

  await page.route('**/api/**', async (route) => {
    const requestUrl = new URL(route.request().url())
    const { pathname } = requestUrl

    if (pathname === '/api/events' && route.request().method() === 'GET') {
      await json(route, 200, [])
      return
    }
    if (pathname === '/api/events/annual' && route.request().method() === 'GET') {
      await json(route, 200, [])
      return
    }
    if (pathname === '/api/calendar/connections' && route.request().method() === 'GET') {
      await json(route, 200, [{
        id: connectionId,
        provider: 'google',
        displayName: 'Google Calendar',
        status: reconnected ? 'connected' : 'disabled',
      }])
      return
    }
    if (pathname === '/api/calendar/connections' && route.request().method() === 'POST') {
      reconnected = true
      await json(route, 201, {
        data: {
          id: connectionId,
          provider: 'google',
          displayName: 'Google Calendar',
          status: 'pending',
        },
      })
      return
    }
    if (pathname === '/api/calendar/conflicts' && route.request().method() === 'GET') {
      await json(route, 200, { conflicts: [] })
      return
    }
    if (pathname === '/api/calendar/invite-rules' && route.request().method() === 'GET') {
      await json(route, 200, { rules: [] })
      return
    }
    if (pathname === `/api/calendar/connections/${connectionId}/calendars`) {
      if (!reconnected) {
        await json(route, 409, {
          error: {
            code: 'CALENDAR_ACCESS_REVOKED',
            message: providerLeak,
            details: { reconnectRequired: true, providerAccountId: 'google-account-123' },
          },
        })
      } else {
        await json(route, 200, {
          calendars: [{ id: 'primary@example.com', name: 'Primary', primary: true }],
        })
      }
      return
    }
    if (pathname === `/api/calendar/connections/${connectionId}/settings` && route.request().method() === 'GET') {
      await json(route, 200, { settings: [savedSetting] })
      return
    }
    if (pathname === `/api/calendar/connections/${connectionId}/settings` && route.request().method() === 'PUT') {
      replacementBody = route.request().postDataJSON()
      await json(route, 200, {
        setting: {
          ...savedSetting,
          externalCalendarId: 'primary@example.com',
        },
        activated: true,
      })
      return
    }
    if (pathname === '/api/calendar/token' && route.request().method() === 'GET') {
      await json(route, 200, { url: 'https://calendar.example.test/ishiki.ics' })
      return
    }
    if (pathname === '/api/auth/signin/google') {
      // Return the product callback as if Google granted the requested scope.
      await json(route, 200, { url: '/events?calendarOAuth=complete' })
      return
    }

    await route.fallback()
  })

  await page.goto('/events')
  await expect(page.getByRole('heading', { name: 'Events & Calendar', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Sync', exact: true }).click()

  const dialog = page.getByRole('dialog', { name: 'Calendar sync' })
  await expect(dialog).toBeVisible()
  const recoveryAlert = page.getByRole('alert').filter({
    hasText: 'Google Calendar access was revoked. Reconnect Google Calendar to continue.',
  })
  await expect(recoveryAlert).toBeVisible()

  const consentRequest = page.waitForRequest((request) => {
    const requestUrl = new URL(request.url())
    return requestUrl.pathname === '/api/auth/signin/google'
  })
  const connectionRequest = page.waitForRequest((request) => {
    const requestUrl = new URL(request.url())
    return requestUrl.pathname === '/api/calendar/connections' && request.method() === 'POST'
  })
  await recoveryAlert.getByRole('button', { name: 'Reconnect Google Calendar', exact: true }).click()

  const consent = await consentRequest
  expect(consent.method()).toBe('POST')
  const connection = await connectionRequest
  expect(connection.method()).toBe('POST')
  expect(connection.postDataJSON()).toEqual({
    provider: 'google',
    displayName: 'Google Calendar',
  })

  await expect(page).toHaveURL(/\/events$/)
  await expect(dialog).toBeVisible()
  await expect(page.getByText('connected', { exact: true })).toBeVisible()
  await expect(recoveryAlert).toHaveCount(0)
  await expect(dialog.getByRole('combobox').nth(0)).toContainText('Primary')
  await expect(dialog.getByRole('combobox').nth(1)).toContainText('Google → Ishiki')
  await expect(dialog).toContainText('Saved: Primary · Google → Ishiki · medical')
  await expect(page.locator('body')).not.toContainText(providerLeak)
  await expect(page.locator('body')).not.toContainText('provider-secret')
  await expect(page.locator('body')).not.toContainText('calendar-owner@example.com')
  await expect(page.locator('body')).not.toContainText('google-account-123')

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Events & Calendar', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Sync', exact: true }).click()

  const reloadedDialog = page.getByRole('dialog', { name: 'Calendar sync' })
  await expect(reloadedDialog).toBeVisible()
  await expect(page.getByText('connected', { exact: true })).toBeVisible()
  await expect(reloadedDialog.getByRole('combobox').nth(0)).toContainText('Primary')
  await expect(reloadedDialog.getByRole('combobox').nth(1)).toContainText('Google → Ishiki')
  await expect(reloadedDialog).toContainText('Saved: Primary · Google → Ishiki · medical')
  await expect(page.locator('body')).not.toContainText(providerLeak)
  await expect(page.locator('body')).not.toContainText('provider-secret')
  await expect(page.locator('body')).not.toContainText('calendar-owner@example.com')
  await expect(page.locator('body')).not.toContainText('google-account-123')

  await reloadedDialog.getByRole('combobox').nth(0).click()
  await page.getByRole('option', { name: 'Primary', exact: true }).click()
  const saveRequest = page.waitForRequest((request) => {
    const requestUrl = new URL(request.url())
    return requestUrl.pathname === `/api/calendar/connections/${connectionId}/settings` && request.method() === 'PUT'
  })
  await reloadedDialog.getByRole('button', { name: 'Review & save settings', exact: true }).click()
  await saveRequest
  expect(replacementBody).toMatchObject({
    externalCalendarId: 'primary@example.com',
    calendarName: 'Primary',
    direction: 'provider_to_syntropic',
    eventTypes: ['medical'],
  })
})