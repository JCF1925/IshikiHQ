#!/usr/bin/env node

const base = process.env.ACCEPTANCE_BASE || 'http://localhost:3000'
const email = process.env.ACCEPTANCE_EMAIL || 'abacus-e9442339@example.com'
const password = process.env.ACCEPTANCE_PASSWORD || 'Syntropic!Test2026'
const jar = {}
const cookies = () => Object.entries(jar).map(([key, value]) => `${key}=${value}`).join('; ')
const save = response => (response.headers.getSetCookie?.() || []).forEach(cookie => {
  const [pair] = cookie.split(';')
  const index = pair.indexOf('=')
  jar[pair.slice(0, index)] = pair.slice(index + 1)
})
const request = async (path, init = {}) => {
  const response = await fetch(`${base}${path}`, {
    ...init,
    redirect: 'manual',
    headers: { ...init.headers, cookie: cookies() },
  })
  save(response)
  return response
}
const json = async (name, response, status) => {
  const body = await response.json().catch(() => null)
  if (response.status !== status) throw new Error(`${name}: HTTP ${response.status}: ${JSON.stringify(body).slice(0, 300)}`)
  console.log(`ok   ${name}`)
  return body?.data ?? body
}

const csrf = await json('CSRF endpoint', await request('/api/auth/csrf'), 200)
await request('/api/auth/callback/credentials', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ csrfToken: csrf.csrfToken, email, password }),
})
const session = await json('seeded account login', await request('/api/auth/session'), 200)
if (!session.user) throw new Error('seeded account login: session missing')
const feed = await json('private iCal fallback token', await request('/api/calendar/token'), 200)
const feedResponse = await fetch(new URL(feed.url, base))
const feedBody = await feedResponse.text()
if (!feedResponse.ok || !feedResponse.headers.get('content-type')?.includes('text/calendar') || !feedBody.includes('BEGIN:VCALENDAR')) {
  throw new Error(`private iCal fallback feed: HTTP ${feedResponse.status}`)
}
console.log('ok   private iCal fallback feed')

const event = await json('medical event fixture', await request('/api/events', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    title: 'Acceptance medical preview',
    type: 'medical',
    startDatetime: '2026-09-10T09:00:00.000Z',
    endDatetime: '2026-09-10T10:00:00.000Z',
    location: 'Private clinic',
    notes: 'Sensitive fixture note',
  }),
}), 201)

try {
  const preview = await json('redacted medical preview', await request(`/api/calendar/events/${event.id}/medical-forwarding`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ destinationCalendarId: 'acceptance-calendar', attendeeEmails: [], fullDetails: false, confirm: false }),
  }), 200)
  if (!preview.preview.redacted || preview.preview.location !== null || preview.preview.notes !== null) {
    throw new Error('redacted medical preview: sensitive fields were present')
  }

  await json('confirmation blocked without exact preview', await request(`/api/calendar/events/${event.id}/medical-forwarding`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ destinationCalendarId: 'acceptance-calendar', attendeeEmails: [], fullDetails: false, confirm: true }),
  }), 409)

  await json('exact preview confirmation accepted', await request(`/api/calendar/events/${event.id}/medical-forwarding`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ destinationCalendarId: 'acceptance-calendar', attendeeEmails: [], fullDetails: false, confirm: true, previewHash: preview.previewHash }),
  }), 200)
  console.log('MEDICAL CONSENT SMOKE: PASS')
} finally {
  await request(`/api/events/${event.id}`, { method: 'DELETE' })
}