import { GOOGLE_CALENDAR_OAUTH_SCOPES } from './calendar-scopes.ts'

/**
 * Server-only provider boundary. Credentials are deliberately passed in by a
 * server credential store and are never part of returned calendar objects.
 */
export const GOOGLE_CALENDAR_SCOPES = GOOGLE_CALENDAR_OAUTH_SCOPES

export type ProviderCalendar = { id: string; name: string; primary?: boolean; accessRole?: string }
export type ProviderEventDetails = {
  id: string
  etag?: string
  status?: 'confirmed'
  title: string
  start: Date
  end: Date | null
  allDay: boolean
  timezone?: string
  location?: string | null
  notes?: string | null
  recurrence?: string[] | null
  attendees?: string[]
  visibility?: 'default' | 'private' | 'public' | 'confidential'
  updatedAt?: Date
}
export type ProviderEventTombstone = {
  id: string
  etag?: string
  status: 'cancelled'
  updatedAt?: Date
}
export type ProviderEvent = ProviderEventDetails | ProviderEventTombstone
export type EventPage = { events: ProviderEvent[]; nextPageToken?: string; cursor?: string }
export type UpsertEvent = Omit<ProviderEventDetails, 'id' | 'etag' | 'status' | 'updatedAt' | 'visibility'> & {
  id?: string
  etag?: string
  status?: 'confirmed' | 'cancelled'
  visibility?: 'default' | 'private'
  sendUpdates: 'all' | 'none'
}
export type CalendarProvider = {
  readonly name: 'google'
  listCalendars(): Promise<ProviderCalendar[]>
  listEvents(calendarId: string, cursor?: string | null, pageToken?: string | null): Promise<EventPage>
  getEvent(calendarId: string, eventId: string): Promise<ProviderEvent>
  upsertEvent(calendarId: string, event: UpsertEvent): Promise<ProviderEvent>
  cancelEvent(calendarId: string, eventId: string, etag?: string): Promise<void>
  revoke(): Promise<void>
}

export class CalendarProviderError extends Error {
  readonly status?: number
  readonly retryAfter?: number

  constructor(message: string, status?: number, retryAfter?: number) {
    super(message)
    this.name = 'CalendarProviderError'
    this.status = status
    this.retryAfter = retryAfter
  }
}

type GoogleToken = { accessToken: string; refreshToken?: string | null; expiresAt?: Date | null }
type GoogleOptions = GoogleToken & {
  clientId: string
  clientSecret: string
  fetch?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  onTokenRefresh?: (token: { accessToken: string; expiresAt: Date; refreshToken?: string }) => Promise<void>
}
type GoogleEvent = {
  id: string
  etag?: string
  status?: 'confirmed' | 'cancelled'
  summary?: string
  location?: string
  description?: string
  updated?: string
  recurrence?: string[]
  attendees?: Array<{ email?: string }>
  visibility?: 'default' | 'private' | 'public' | 'confidential'
  start?: { dateTime?: string; date?: string; timeZone?: string }
  end?: { dateTime?: string; date?: string; timeZone?: string }
}

const api = 'https://www.googleapis.com/calendar/v3'
const oauth = 'https://oauth2.googleapis.com'
const defaultSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

/** Google implementation with refresh-once and bounded retry for transient failures. */
export class GoogleCalendarProvider implements CalendarProvider {
  readonly name = 'google' as const
  private accessToken: string
  private expiresAt?: Date | null
  private refreshToken?: string | null
  private readonly requestFetch: typeof fetch
  private readonly sleep: (ms: number) => Promise<void>
  private readonly options: GoogleOptions

  constructor(options: GoogleOptions) {
    this.options = options
    this.accessToken = options.accessToken
    this.expiresAt = options.expiresAt
    this.refreshToken = options.refreshToken
    this.requestFetch = options.fetch ?? fetch
    this.sleep = options.sleep ?? defaultSleep
  }

  private async refreshIfNeeded(force = false) {
    if (!force && (!this.expiresAt || this.expiresAt.getTime() > Date.now() + 60_000)) return
    if (!this.refreshToken) throw new CalendarProviderError('Calendar connection needs to be reconnected', 401)
    const response = await this.requestFetch(`${oauth}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.options.clientId,
        client_secret: this.options.clientSecret,
        refresh_token: this.refreshToken,
        grant_type: 'refresh_token',
      }),
    })
    const body = await response.json() as {
      access_token?: string
      expires_in?: number
      refresh_token?: string
      error?: string
    }
    if (!response.ok || !body.access_token) {
      // Google reports revoked/expired refresh grants as HTTP 400. Normalize
      // that permanent credential failure to the worker/API reconnect path.
      const status = response.status === 400 && body.error === 'invalid_grant' ? 401 : response.status
      throw new CalendarProviderError(`Calendar token refresh failed: ${body.error ?? response.status}`, status)
    }
    this.accessToken = body.access_token
    this.expiresAt = new Date(Date.now() + (body.expires_in ?? 3600) * 1000)
    if (body.refresh_token) this.refreshToken = body.refresh_token
    await this.options.onTokenRefresh?.({
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      expiresAt: this.expiresAt,
    })
  }

  private async request(path: string, init: RequestInit = {}, retriedAuth = false): Promise<Response> {
    await this.refreshIfNeeded()
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await this.requestFetch(`${api}${path}`, {
        ...init,
        headers: {
          ...init.headers,
          authorization: `Bearer ${this.accessToken}`,
          accept: 'application/json',
        },
      })
      if (response.status === 401 && !retriedAuth) {
        await this.refreshIfNeeded(true)
        return this.request(path, init, true)
      }
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 2) {
        if (!response.ok) {
          const retryAfter = Number(response.headers.get('retry-after') ?? '') || undefined
          throw new CalendarProviderError(`Google Calendar request failed (${response.status})`, response.status, retryAfter)
        }
        return response
      }
      const retryAfterHeader = response.headers.get('retry-after')
      const retryAfter = retryAfterHeader === null ? Number.NaN : Number(retryAfterHeader)
      await this.sleep(Number.isFinite(retryAfter) ? retryAfter * 1000 : 250 * 2 ** attempt)
    }
    throw new CalendarProviderError('Google Calendar request failed')
  }

  private toProvider(event: GoogleEvent): ProviderEvent {
    const updatedAt = event.updated ? new Date(event.updated) : undefined
    if (event.status === 'cancelled') {
      return {
        id: event.id,
        etag: event.etag,
        status: 'cancelled',
        updatedAt,
      }
    }
    if (!event.start || !event.end) {
      throw new CalendarProviderError('Google Calendar event is missing required time fields')
    }
    const allDay = Boolean(event.start.date)
    return {
      id: event.id,
      etag: event.etag,
      status: event.status,
      title: event.summary ?? '',
      start: new Date(event.start.dateTime ?? `${event.start.date}T00:00:00.000Z`),
      end: event.end.dateTime
        ? new Date(event.end.dateTime)
        : event.end.date
          ? new Date(`${event.end.date}T00:00:00.000Z`)
          : null,
      allDay,
      timezone: event.start.timeZone,
      location: event.location ?? null,
      notes: event.description ?? null,
      recurrence: event.recurrence ?? null,
      ...(event.attendees
        ? { attendees: event.attendees.flatMap(attendee => attendee.email ? [attendee.email] : []) }
        : {}),
      visibility: event.visibility,
      updatedAt,
    }
  }

  private payload(event: UpsertEvent) {
    const date = (value: Date) => value.toISOString().slice(0, 10)
    return {
      summary: event.title,
      location: event.location ?? undefined,
      description: event.notes ?? undefined,
      start: event.allDay
        ? { date: date(event.start) }
        : { dateTime: event.start.toISOString(), timeZone: event.timezone },
      end: event.end
        ? event.allDay
          ? { date: date(event.end) }
          : { dateTime: event.end.toISOString(), timeZone: event.timezone }
        : undefined,
      recurrence: event.recurrence ?? undefined,
      attendees: event.attendees?.map(email => ({ email })),
      visibility: event.visibility,
    }
  }

  async listCalendars() {
    const data = await (await this.request('/users/me/calendarList')).json() as {
      items?: Array<{ id: string; summary?: string; primary?: boolean; accessRole?: string }>
    }
    return (data.items ?? []).map(item => ({
      id: item.id,
      name: item.summary ?? item.id,
      primary: item.primary,
      accessRole: item.accessRole,
    }))
  }

  async listEvents(calendarId: string, cursor?: string | null, pageToken?: string | null) {
    const query = new URLSearchParams({ singleEvents: 'false', showDeleted: 'true', maxResults: '250' })
    if (cursor) query.set('syncToken', cursor)
    if (pageToken) query.set('pageToken', pageToken)
    const data = await (await this.request(
      `/calendars/${encodeURIComponent(calendarId)}/events?${query}`,
    )).json() as { items?: GoogleEvent[]; nextPageToken?: string; nextSyncToken?: string }
    return {
      events: (data.items ?? []).map(event => this.toProvider(event)),
      nextPageToken: data.nextPageToken,
      cursor: data.nextSyncToken,
    }
  }

  async getEvent(calendarId: string, eventId: string) {
    const response = await this.request(
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    )
    return this.toProvider(await response.json() as GoogleEvent)
  }

  async upsertEvent(calendarId: string, event: UpsertEvent) {
    const basePath = event.id
      ? `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(event.id)}`
      : `/calendars/${encodeURIComponent(calendarId)}/events`
    const path = `${basePath}?sendUpdates=${event.sendUpdates}`
    const response = await this.request(path, {
      method: event.id ? 'PUT' : 'POST',
      headers: {
        'content-type': 'application/json',
        ...(event.etag ? { 'if-match': event.etag } : {}),
      },
      body: JSON.stringify(this.payload(event)),
    })
    return this.toProvider(await response.json() as GoogleEvent)
  }

  async cancelEvent(calendarId: string, eventId: string, etag?: string) {
    await this.request(
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
      { method: 'DELETE', headers: etag ? { 'if-match': etag } : {} },
    )
  }

  async revoke() {
    if (!this.refreshToken) return
    const response = await this.requestFetch(`${oauth}/revoke`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: this.refreshToken }),
    })
    if (!response.ok && response.status !== 400) {
      throw new CalendarProviderError(`Google token revocation failed (${response.status})`, response.status)
    }
  }
}
