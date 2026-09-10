import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { chromium, expect, type Page } from '@playwright/test'
import {
  calendarRecoveryExpectedDiagnostics,
  calendarRecoveryStagingChecks,
  captureCalendarRecoveryDiagnostics,
  type CalendarRecoveryDiagnostic,
  writeCalendarRecoveryStagingEvidence,
} from './calendar-recovery-staging-evidence'
import { writeGoogleAuthStagingEvidence } from './google-auth-staging-evidence'

const baseUrlValue = process.env.AUTH_REGRESSION_BASE

const evidenceFileTemplate = process.env.AUTH_REGRESSION_EVIDENCE_FILE
  || 'test-results/google-auth-staging-evidence.json'
const calendarEvidenceFileTemplate = process.env.CALENDAR_RECOVERY_EVIDENCE_FILE
  || 'test-results/calendar-recovery-staging-evidence.json'
const calendarDiagnosticLogFile = process.env.CALENDAR_RECOVERY_STAGING_LOG_FILE
const chromiumPath = process.env.CHROMIUM_BIN || '/repl/tools/bin/chromium'
const browserTimeout = Number(process.env.GOOGLE_AUTH_STAGING_TIMEOUT_MS || 180_000)
const calendarConnectionId = process.env.CALENDAR_RECOVERY_STAGING_CONNECTION_ID
const calendarRecoveryChecks = Object.fromEntries(
  calendarRecoveryStagingChecks.map((check) => [check, false]),
) as Record<(typeof calendarRecoveryStagingChecks)[number], boolean>
let calendarObservedDiagnostics: CalendarRecoveryDiagnostic[] = []
let calendarLogConfirmed = false

function requireCalendarStagingConfiguration() {
  assert.equal(
    process.env.CALENDAR_RECOVERY_STAGING,
    '1',
    'CALENDAR_RECOVERY_STAGING=1 is required for the staging Calendar recovery check',
  )
  assert.equal(
    process.env.CALENDAR_RECOVERY_STAGING_ENVIRONMENT,
    'NON_PRODUCTION',
    'CALENDAR_RECOVERY_STAGING_ENVIRONMENT must be NON_PRODUCTION',
  )
  assert.ok(
    calendarConnectionId && /^[A-Za-z0-9_-]+$/.test(calendarConnectionId),
    'CALENDAR_RECOVERY_STAGING_CONNECTION_ID must be a safe connection identifier',
  )
  assert.ok(
    calendarDiagnosticLogFile,
    'CALENDAR_RECOVERY_STAGING_LOG_FILE must point to the captured staging server output',
  )
  return calendarConnectionId
}

async function readCalendarDiagnosticLog() {
  assert.ok(
    calendarDiagnosticLogFile,
    'CALENDAR_RECOVERY_STAGING_LOG_FILE must point to the captured staging server output',
  )
  return readFile(calendarDiagnosticLogFile, 'utf8')
}

async function runCalendarRecoveryStagingCheck(
  page: Page,
  baseUrl: URL,
) {
  const connectionId = requireCalendarStagingConfiguration()
  const checks = [
    { name: 'listCalendarsProvider' as const, route: 'list-calendars', method: 'GET', failure: 'provider' },
    { name: 'listCalendarsApplication' as const, route: 'list-calendars', method: 'GET', failure: 'application' },
    { name: 'syncNowProvider' as const, route: 'sync-now', method: 'POST', failure: 'provider' },
    { name: 'syncNowApplication' as const, route: 'sync-now', method: 'POST', failure: 'application' },
  ] as const
  const unsafeValue = /error_description|access_token|refresh_token|providerAccountId|callbackUrl|redirect|secret|calendar-owner@example\.com/i
  const safeContract = {
    code: 'INTERNAL_ERROR',
    message: 'Google Calendar is temporarily unavailable. Try again later.',
  }

  for (const check of checks) {
    const endpoint = check.route === 'list-calendars' ? 'calendars' : 'sync-now'
    const response = await page.request.fetch(
      new URL(`/api/calendar/connections/${encodeURIComponent(connectionId)}/${endpoint}`, baseUrl).href,
      {
        method: check.method,
        headers: { 'x-syntropic-calendar-recovery': `${check.route}:${check.failure}` },
      },
    )
    assert.equal(response.status, 503, `${check.name} must use the transient HTTP status`)
    const body = await response.json() as { error?: { code?: string; message?: string; details?: unknown } }
    assert.deepEqual(body, {
      error: {
        ...safeContract,
        details: { retryAfterSeconds: check.failure === 'provider' ? 3600 : 30 },
      },
    })
    assert.doesNotMatch(JSON.stringify(body), unsafeValue)
    calendarRecoveryChecks[check.name] = true
  }

  const serverOutput = await readCalendarDiagnosticLog()
  calendarObservedDiagnostics = captureCalendarRecoveryDiagnostics(serverOutput)
  calendarLogConfirmed = JSON.stringify(calendarObservedDiagnostics)
    === JSON.stringify(calendarRecoveryExpectedDiagnostics)
}

function stagingUrl() {
  assert.ok(baseUrlValue, 'AUTH_REGRESSION_BASE is required for the staging Google OAuth smoke test')
  const url = new URL(baseUrlValue)
  assert.equal(url.protocol, 'https:', 'staging Google OAuth must use a public HTTPS origin')
  assert.equal(url.username, '', 'AUTH_REGRESSION_BASE must not contain credentials')
  assert.equal(url.password, '', 'AUTH_REGRESSION_BASE must not contain credentials')
  assert.equal(url.search, '', 'AUTH_REGRESSION_BASE must contain only the public origin')
  assert.equal(url.hash, '', 'AUTH_REGRESSION_BASE must contain only the public origin')
  assert.equal(url.pathname, '/', 'AUTH_REGRESSION_BASE must contain only the public origin')
  return url
}

test('a real Google grant returns to the staging Syntropic dashboard', async () => {
  let stagingOrigin: string | null = null
  let callbackPath: string | null = null
  let callbackObserved = false
  let returnedToDestinationPath = false
  let calendarStagingOrigin: string | null = null
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined

  try {
    const baseUrl = stagingUrl()
    stagingOrigin = baseUrl.origin

    const providersResponse = await fetch(new URL('/api/auth/providers', baseUrl))
    assert.equal(providersResponse.status, 200)
    const providers = await providersResponse.json() as {
      google?: { callbackUrl?: string }
    }
    assert.ok(providers.google?.callbackUrl, 'Google provider should be configured on staging')

    const googleCallback = new URL(providers.google.callbackUrl)
    callbackPath = googleCallback.pathname
    assert.equal(
      googleCallback.origin,
      baseUrl.origin,
      'staging Google callback must use the configured public origin',
    )
    assert.equal(
      googleCallback.pathname,
      '/api/auth/callback/google',
      'Google must return to the Auth.js callback route',
    )
    assert.equal(googleCallback.search, '', 'Google callback must not contain a query string')
    assert.equal(googleCallback.hash, '', 'Google callback must not contain a fragment')

    browser = await chromium.launch({
      executablePath: chromiumPath,
      headless: process.env.GOOGLE_AUTH_STAGING_HEADLESS === '1',
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    })
    const context = await browser.newContext({ locale: 'en-AU' })
    const page = await context.newPage()
    page.on('request', (request) => {
      try {
        const requestUrl = new URL(request.url())
        if (requestUrl.origin === baseUrl.origin && requestUrl.pathname === googleCallback.pathname) {
          callbackObserved = true
        }
      } catch {
        // Ignore non-URL browser requests without logging their contents.
      }
    })

    const loginUrl = new URL('/login', baseUrl)
    loginUrl.searchParams.set('callbackUrl', '/')
    await page.goto(loginUrl.href, { waitUntil: 'domcontentloaded' })
    const googleButton = page.getByRole('button', { name: 'Continue with Google', exact: true })
    await expect(googleButton).toBeVisible()

    // The headed browser intentionally pauses here for the designated staging
    // account. No credentials, provider URLs, or page contents are recorded.
    await Promise.all([
      page.waitForURL((url) => (
        url.hostname === 'accounts.google.com'
        || url.hostname.endsWith('.google.com')
        || url.hostname.endsWith('.googleusercontent.com')
      ), { timeout: 30_000 }),
      googleButton.click(),
    ])

    await page.waitForURL(
      (url) => url.origin === baseUrl.origin && url.pathname === '/',
      { timeout: browserTimeout },
    )
    returnedToDestinationPath = true
    assert.equal(callbackObserved, true, 'the browser should visit the real Google callback route')
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true }))
      .toBeVisible({ timeout: 15_000 })
    calendarStagingOrigin = baseUrl.origin
    await runCalendarRecoveryStagingCheck(page, baseUrl)
  } catch {
    throw new Error('Staging Google OAuth smoke failed; inspect the privacy-safe evidence file.')
  } finally {
    if (browser) await browser.close()
    const evidenceFile = await writeGoogleAuthStagingEvidence(evidenceFileTemplate, {
      checkedAt: new Date().toISOString(),
      stagingOrigin,
      callbackPath,
      destinationPath: '/',
      callbackObserved,
      returnedToDestinationPath,
    })
    process.stderr.write(`Privacy-safe staging OAuth evidence: ${evidenceFile}\n`)
    const calendarEvidenceFile = await writeCalendarRecoveryStagingEvidence(calendarEvidenceFileTemplate, {
      checkedAt: new Date().toISOString(),
      stagingOrigin: calendarStagingOrigin,
      checks: calendarRecoveryChecks,
      expectedDiagnostics: [...calendarRecoveryExpectedDiagnostics],
      diagnosticLogConfirmation: {
        observedDiagnostics: calendarObservedDiagnostics,
        allExpectedDiagnosticsObserved: calendarLogConfirmed,
      },
      allPassed: Object.values(calendarRecoveryChecks).every(Boolean)
        && calendarLogConfirmed,
    })
    process.stderr.write(`Privacy-safe staging Calendar recovery evidence: ${calendarEvidenceFile}\n`)
  }
})
