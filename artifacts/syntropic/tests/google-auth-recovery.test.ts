import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { test } from 'node:test'
import { chromium, expect as expectBrowser } from '@playwright/test'

const execFileAsync = promisify(execFile)
const baseUrl = process.env.AUTH_REGRESSION_BASE
const regressionRequired = process.env.AUTH_REGRESSION_REQUIRED === '1'
const retryMessage = 'Google sign-in expired or could not be completed. Please try again.'

const cancelledMessage = 'Google sign-in was cancelled. You can try again whenever you’re ready.'
const cookies = new Map<string, string>()

function saveCookies(response: Response) {
  for (const cookie of response.headers.getSetCookie()) {
    const [pair] = cookie.split(';', 1)
    const separator = pair.indexOf('=')
    if (separator > 0) cookies.set(pair.slice(0, separator), pair.slice(separator + 1))
  }
}

function cookieHeader() {
  return [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ')
}

async function request(path: string, init: RequestInit = {}) {
  assert.ok(baseUrl)
  const headers = new Headers(init.headers)
  if (cookieHeader()) headers.set('cookie', cookieHeader())
  const response = await fetch(new URL(path, baseUrl), {
    ...init,
    headers,
    redirect: 'manual',
  })
  saveCookies(response)
  return response
}

function locationOf(response: Response) {
  const location = response.headers.get('location')
  assert.ok(location, `expected ${response.status} response to include a location`)
  return new URL(location, baseUrl)
}

async function renderedDom(url: URL) {
  const chromium = process.env.CHROMIUM_BIN || '/repl/tools/bin/chromium'
  const { stdout } = await execFileAsync(chromium, [
    '--headless',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--virtual-time-budget=5000',
    '--dump-dom',
    url.href,
  ], { maxBuffer: 4 * 1024 * 1024 })
  return stdout
}

async function startGoogleSignIn(callbackUrl: string) {
  const csrfResponse = await request('/api/auth/csrf')
  assert.equal(csrfResponse.status, 200)
  const { csrfToken } = await csrfResponse.json() as { csrfToken?: string }
  assert.ok(csrfToken, 'Google sign-in should obtain a CSRF token')

  const startResponse = await request('/api/auth/signin/google', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-auth-return-redirect': '1',
    },
    body: new URLSearchParams({ csrfToken, callbackUrl }),
  })
  assert.equal(startResponse.status, 200)
}

test('Auth.js recovery errors stay on the Ishiki origin', {
  skip: !baseUrl && !regressionRequired
    ? 'Set AUTH_REGRESSION_BASE to the running Syntropic web server'
    : false,
}, async () => {
  assert.ok(baseUrl, 'AUTH_REGRESSION_BASE is required for the Auth.js recovery regression')
  const scenarios = [
    {
      error: 'Configuration',
      callbackUrl: '/events?from=configuration#retry',
      expectedCallbackUrl: '/events?from=configuration#retry',
    },
    {
      error: 'CallbackRouteError',
      callbackUrl: '/health?from=callback#retry',
      expectedCallbackUrl: '/health?from=callback#retry',
    },
    {
      error: 'CallbackRouteError',
      callbackUrl: 'https://evil.example/phish?next=/health#bad',
      expectedCallbackUrl: '/',
    },
  ] as const

  for (const scenario of scenarios) {
    cookies.clear()
    await startGoogleSignIn(scenario.callbackUrl)

    const recoveryResponse = await request(
      `/api/auth/error?error=${encodeURIComponent(scenario.error)}`,
    )
    assert.equal(recoveryResponse.status, 302)
    const rawLocation = recoveryResponse.headers.get('location')
    assert.ok(rawLocation)
    assert.ok(rawLocation.startsWith('/'), 'recovery redirects must be relative to the current origin')

    const recoveryUrl = locationOf(recoveryResponse)
    assert.equal(recoveryUrl.origin, new URL(baseUrl).origin)
    assert.equal(recoveryUrl.pathname, '/login')
    assert.equal(recoveryUrl.searchParams.get('error'), scenario.error)
    assert.equal(recoveryUrl.searchParams.get('callbackUrl'), scenario.expectedCallbackUrl)

    const dom = await renderedDom(recoveryUrl)
    assert.match(dom, new RegExp(retryMessage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.doesNotMatch(dom, /Auth\.js server error|Configuration error/i)
  }
})

test('Google OAuth recovers from a mismatched PKCE callback', {
  skip: !baseUrl && !regressionRequired
    ? 'Set AUTH_REGRESSION_BASE to the running Syntropic web server'
    : false,
}, async () => {
  assert.ok(baseUrl, 'AUTH_REGRESSION_BASE is required for the Google OAuth regression')
  const providersResponse = await request('/api/auth/providers')
  assert.equal(providersResponse.status, 200)
  const providers = await providersResponse.json() as {
    google?: { callbackUrl: string }
  }
  assert.ok(providers.google, 'Google provider should be configured')

  const googleCallback = new URL(providers.google.callbackUrl)

  assert.equal(googleCallback.protocol, 'https:', 'OAuth callbacks must use the public HTTPS origin')
  assert.equal(
    googleCallback.pathname,
    '/api/auth/callback/google',
    'Google must return to the Auth.js callback route',
  )

  const csrfResponse = await request('/api/auth/csrf')
  assert.equal(csrfResponse.status, 200)
  const { csrfToken } = await csrfResponse.json() as { csrfToken?: string }

  const callbackDestination = '/events?from=google-denied#retry'
  assert.ok(csrfToken, 'Google sign-in should obtain a CSRF token')

  const startResponse = await request('/api/auth/signin/google', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-auth-return-redirect': '1',
    },
    body: new URLSearchParams({ csrfToken, callbackUrl: callbackDestination }),
  })
  assert.equal(startResponse.status, 200)
  const startResult = await startResponse.json() as { url?: string }
  assert.ok(startResult.url, 'Google sign-in should return an authorization URL')
  const authorizationUrl = new URL(startResult.url)
  assert.equal(
    authorizationUrl.searchParams.get('redirect_uri'),
    providers.google.callbackUrl,
    'Google authorization must use the public callback URL',
  )
  const pkceCookieName = [...cookies.keys()].find((name) => (
    name === 'authjs.pkce.code_verifier' || name === '__Secure-authjs.pkce.code_verifier'
  ))
  assert.ok(pkceCookieName, 'fresh Google sign-in should set an Auth.js PKCE cookie')
  const pkceSetCookie = startResponse.headers.getSetCookie().find((cookie) => cookie.startsWith(`${pkceCookieName}=`))
  assert.ok(pkceSetCookie, 'PKCE cookie should be present in the sign-in response')
  assert.match(pkceSetCookie, /HttpOnly/i)
  assert.match(pkceSetCookie, /SameSite=(Lax|None)/i)

  const deniedResponse = await request(
    `${googleCallback.pathname}?error=access_denied&error_description=User%20cancelled`,
  )
  assert.equal(deniedResponse.status, 302)

  // Simulate a callback after the browser has lost or replaced its original verifier.
  cookies.set(pkceCookieName, 'expired-or-mismatched-verifier')
  const callbackPath = `${googleCallback.pathname}?code=expired-google-code`
  const callbackResponse = await request(callbackPath)
  assert.equal(callbackResponse.status, 302)
  const recoveryUrl = locationOf(deniedResponse)
  assert.equal(recoveryUrl.pathname, '/login')
  assert.equal(recoveryUrl.searchParams.get('error'), 'GoogleAccessDenied')
  assert.equal(recoveryUrl.searchParams.get('callbackUrl'), callbackDestination)
  assert.doesNotMatch(recoveryUrl.search, /error_description|User%20cancelled/i)

  const localRecoveryUrl = new URL(`${recoveryUrl.pathname}${recoveryUrl.search}`, baseUrl)
  const dom = await renderedDom(localRecoveryUrl)
  assert.match(dom, new RegExp(cancelledMessage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.doesNotMatch(dom, /Auth\.js server error|Configuration error/i)
})

test('Google OAuth denial recovery rejects unsafe callback destinations', {
  skip: !baseUrl && !regressionRequired
    ? 'Set AUTH_REGRESSION_BASE to the running Syntropic web server'
    : false,
}, async () => {
  assert.ok(baseUrl, 'AUTH_REGRESSION_BASE is required for the Google OAuth regression')
  const providersResponse = await request('/api/auth/providers')
  assert.equal(providersResponse.status, 200)
  const providers = await providersResponse.json() as {
    google?: { callbackUrl: string }
  }
  assert.ok(providers.google, 'Google provider should be configured')

  const googleCallback = new URL(providers.google.callbackUrl)
  const scenarios = [
    {
      name: 'external',
      callbackUrl: 'https://evil.example/account?next=/events#phish',
      expectedCallbackUrl: '/',
    },
    {
      name: 'malformed',
      callbackUrl: '/\\evil.example?next=/events#phish',
      expectedCallbackUrl: '/',
    },
    {
      name: 'safe local',
      callbackUrl: '/events?from=google-denied#retry',
      expectedCallbackUrl: '/events?from=google-denied#retry',
    },
  ]

  for (const scenario of scenarios) {
    cookies.clear()

    const csrfResponse = await request('/api/auth/csrf')
    assert.equal(csrfResponse.status, 200)
    const { csrfToken } = await csrfResponse.json() as { csrfToken?: string }
    assert.ok(csrfToken, `${scenario.name} callback should obtain a CSRF token`)

    const startResponse = await request('/api/auth/signin/google', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-auth-return-redirect': '1',
      },
      body: new URLSearchParams({
        csrfToken,
        callbackUrl: scenario.callbackUrl,
      }),
    })
    assert.equal(startResponse.status, 200)

    const deniedResponse = await request(
      `${googleCallback.pathname}?error=access_denied&error_description=User%20cancelled`,
    )
    assert.equal(deniedResponse.status, 302)

    const recoveryUrl = locationOf(deniedResponse)
    assert.equal(recoveryUrl.origin, new URL(baseUrl).origin)
    assert.equal(recoveryUrl.pathname, '/login', `${scenario.name} recovery must return to /login`)
    assert.equal(recoveryUrl.searchParams.get('error'), 'GoogleAccessDenied')
    assert.equal(
      recoveryUrl.searchParams.get('callbackUrl'),
      scenario.expectedCallbackUrl,
      `${scenario.name} callback must retain only a safe local destination`,
    )
    assert.doesNotMatch(recoveryUrl.search, /error_description|User%20cancelled/i)

    const dom = await renderedDom(recoveryUrl)
    assert.match(dom, new RegExp(cancelledMessage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.doesNotMatch(dom, /Auth\.js server error|Configuration error/i)
  }
})

test('Google cancellation recovery lets credentials return only to a safe destination', {
  skip: !baseUrl && !regressionRequired
    ? 'Set AUTH_REGRESSION_BASE to the running Syntropic web server'
    : false,
}, async () => {
  assert.ok(baseUrl, 'AUTH_REGRESSION_BASE is required for the Google OAuth regression')

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_BIN || '/repl/tools/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })

  const scenarios = [
    {
      name: 'safe local callback',
      callbackUrl: '/events?from=google-denied#retry',
      expectedCallbackUrl: '/events?from=google-denied#retry',
    },
    {
      name: 'external callback',
      callbackUrl: 'https://evil.example/account?next=/events#phish',
      expectedCallbackUrl: '/',
    },
    {
      name: 'malformed callback',
      callbackUrl: '/\\evil.example?next=/events#phish',
      expectedCallbackUrl: '/',
    },
  ] as const

  try {
    for (const scenario of scenarios) {
      const context = await browser.newContext()
      const page = await context.newPage()
      const loginUrl: URL = new URL('/login', baseUrl)
      loginUrl.searchParams.set('error', 'GoogleAccessDenied')
      loginUrl.searchParams.set('callbackUrl', scenario.callbackUrl)

      await page.goto(loginUrl.href)
      await expectBrowser(page.locator('#login-error')).toHaveText(cancelledMessage)
      await page.getByLabel('Email').fill(
        process.env.SYNTROPIC_E2E_EMAIL ?? 'abacus-e9442339@example.com',
      )
      await page.getByLabel('Password').fill('one-mistyped-password')
      await page.getByRole('button', { name: 'Sign in', exact: true }).click()
      await expectBrowser(page.locator('#login-error')).toHaveText('Invalid email or password.')
      assert.equal(
        page.url(),
        loginUrl.href,
        `${scenario.name} must keep its recovery callback after rejected credentials`,
      )

      await page.getByLabel('Password').fill(
        process.env.SYNTROPIC_E2E_PASSWORD ?? 'Syntropic!Test2026',
      )
      await page.getByRole('button', { name: 'Sign in', exact: true }).click()

      const expectedUrl: URL = new URL(scenario.expectedCallbackUrl, baseUrl)
      await expectBrowser.poll(
        () => page.url(),
        {
          message: `${scenario.name} should navigate to ${expectedUrl.pathname}${expectedUrl.search}${expectedUrl.hash}`,
        },
      ).toBe(expectedUrl.href)
      assert.equal(
        page.url(),
        expectedUrl.href,
        `${scenario.name} must stay on the Ishiki origin and preserve only its safe destination`,
      )
      assert.equal(new URL(page.url()).origin, new URL(baseUrl).origin)

      await context.close()
    }
  } finally {
    await browser.close()
  }
})

test('Google cancellation recovery carries a safe destination into signup', {
  skip: !baseUrl && !regressionRequired
    ? 'Set AUTH_REGRESSION_BASE to the running Syntropic web server'
    : false,
}, async () => {
  assert.ok(baseUrl, 'AUTH_REGRESSION_BASE is required for the Google OAuth regression')

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_BIN || '/repl/tools/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })

  const scenarios = [
    {
      name: 'safe local callback',
      callbackUrl: '/events?from=signup#retry',
      expectedCallbackUrl: '/events?from=signup#retry',
    },
    {
      name: 'external callback',
      callbackUrl: 'https://evil.example/account?next=/events#phish',
      expectedCallbackUrl: '/',
    },
    {
      name: 'malformed callback',
      callbackUrl: '/\\evil.example?next=/events#phish',
      expectedCallbackUrl: '/',
    },
  ] as const

  try {
    for (const scenario of scenarios) {
      const context = await browser.newContext()
      const page = await context.newPage()
      const expectedPath = new URL(scenario.expectedCallbackUrl, baseUrl).pathname

      await page.route('**/*', async (route) => {
        const requestUrl = new URL(route.request().url())
        if (requestUrl.origin === new URL(baseUrl).origin && requestUrl.pathname === expectedPath) {
          await route.fulfill({
            status: 200,
            contentType: 'text/html',
            body: '<!doctype html><html><body>browser regression destination</body></html>',
          })
          return
        }
        await route.continue()
      })

      await page.route('**/api/signup', async (route) => {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'browser-regression-user',
            email: 'browser-regression@example.com',
            name: 'Browser Regression',
          }),
        })
      })
      await page.route('**/api/auth/providers', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            credentials: {
              id: 'credentials',
              name: 'Credentials',
              type: 'credentials',
              signinUrl: '/api/auth/signin/credentials',
              callbackUrl: '/api/auth/callback/credentials',
            },
          }),
        })
      })
      await page.route('**/api/auth/csrf', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ csrfToken: 'browser-regression-csrf-token' }),
        })
      })
      await page.route('**/api/auth/callback/credentials**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            url: new URL(scenario.expectedCallbackUrl, baseUrl).href,
          }),
        })
      })

      const loginUrl = new URL('/login', baseUrl)
      loginUrl.searchParams.set('error', 'GoogleAccessDenied')
      loginUrl.searchParams.set('callbackUrl', scenario.callbackUrl)

      await page.goto(loginUrl.href)
      await expectBrowser(page.locator('#login-error')).toHaveText(cancelledMessage)
      await page.getByRole('link', { name: 'Sign up', exact: true }).click()
      await expectBrowser(page).toHaveURL(/\/signup\?callbackUrl=/)

      const signupUrl = new URL(page.url())
      assert.equal(signupUrl.origin, new URL(baseUrl).origin)
      assert.equal(signupUrl.pathname, '/signup')
      assert.equal(
        signupUrl.searchParams.get('callbackUrl'),
        scenario.expectedCallbackUrl,
        `${scenario.name} signup link must retain only a safe local destination`,
      )

      await page.getByLabel('Name').fill('Browser Regression')
      await page.getByLabel('Email').fill('browser-regression@example.com')
      await page.getByLabel('Password').fill('BrowserRegression!2026')
      await page.getByRole('button', { name: 'Create account', exact: true }).click()

      const expectedUrl = new URL(scenario.expectedCallbackUrl, baseUrl)
      await expectBrowser.poll(
        () => page.url(),
        {
          message: `${scenario.name} signup should navigate to ${expectedUrl.pathname}${expectedUrl.search}${expectedUrl.hash}`,
        },
      ).toBe(expectedUrl.href)
      assert.equal(new URL(page.url()).origin, new URL(baseUrl).origin)

      await context.close()
    }
  } finally {
    await browser.close()
  }
})

test('Signup recovery preserves only a safe callback after automatic sign-in fails', {
  skip: !baseUrl && !regressionRequired
    ? 'Set AUTH_REGRESSION_BASE to the running Syntropic web server'
    : false,
}, async () => {
  assert.ok(baseUrl, 'AUTH_REGRESSION_BASE is required for the Google OAuth regression')

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_BIN || '/repl/tools/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })

  const scenarios = [
    {
      name: 'safe local callback',
      callbackUrl: '/events?from=signup-failed-auto-login#retry',
      expectedCallbackUrl: '/events?from=signup-failed-auto-login#retry',
    },
    {
      name: 'external callback',
      callbackUrl: 'https://evil.example/account?next=/events#phish',
      expectedCallbackUrl: '/',
    },
    {
      name: 'malformed callback',
      callbackUrl: '/\\evil.example?next=/events#phish',
      expectedCallbackUrl: '/',
    },
  ] as const

  try {
    for (const scenario of scenarios) {
      const context = await browser.newContext()
      const page = await context.newPage()
      let signupRequestSeen = false
      let credentialsSignInRequestSeen = false

      await page.route('**/api/signup', async (route) => {
        signupRequestSeen = true
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'browser-regression-user',
            email: 'browser-regression@example.com',
            name: 'Browser Regression',
          }),
        })
      })
      await page.route('**/api/auth/providers', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            credentials: {
              id: 'credentials',
              name: 'Credentials',
              type: 'credentials',
              signinUrl: '/api/auth/signin/credentials',
              callbackUrl: '/api/auth/callback/credentials',
            },
          }),
        })
      })
      await page.route('**/api/auth/csrf', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ csrfToken: 'browser-regression-csrf-token' }),
        })
      })
      await page.route('**/api/auth/callback/credentials**', async (route) => {
        credentialsSignInRequestSeen = true
        const failureUrl = new URL('/login', baseUrl)
        failureUrl.searchParams.set('error', 'CredentialsSignin')
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ url: failureUrl.href }),
        })
      })

      const signupUrl = new URL('/signup', baseUrl)
      signupUrl.searchParams.set('callbackUrl', scenario.callbackUrl)
      await page.goto(signupUrl.href)
      await page.getByLabel('Name').fill('Browser Regression')
      await page.getByLabel('Email').fill('browser-regression@example.com')
      await page.getByLabel('Password').fill('BrowserRegression!2026')
      await page.getByRole('button', { name: 'Create account', exact: true }).click()

      const expectedLoginUrl = new URL('/login', baseUrl)
      expectedLoginUrl.searchParams.set('callbackUrl', scenario.expectedCallbackUrl)
      await expectBrowser.poll(
        () => page.url(),
        {
          message: `${scenario.name} should return to login with its safe callback`,
        },
      ).toBe(expectedLoginUrl.href)

      assert.equal(signupRequestSeen, true, `${scenario.name} should create the account first`)
      assert.equal(
        credentialsSignInRequestSeen,
        true,
        `${scenario.name} should attempt automatic credentials sign-in`,
      )
      assert.equal(new URL(page.url()).origin, new URL(baseUrl).origin)
      assert.equal(new URL(page.url()).pathname, '/login')
      assert.deepEqual(
        [...new URL(page.url()).searchParams.keys()],
        ['callbackUrl'],
        `${scenario.name} recovery should include only the callback parameter`,
      )
      assert.equal(
        new URL(page.url()).searchParams.get('callbackUrl'),
        scenario.expectedCallbackUrl,
        `${scenario.name} recovery must retain only a safe local destination`,
      )

      await context.close()
    }
  } finally {
    await browser.close()
  }
})
