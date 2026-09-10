export const GOOGLE_CALENDAR_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events',
] as const

export const GOOGLE_CALENDAR_AUTH_SCOPE = [
  'openid',
  'email',
  'profile',
  ...GOOGLE_CALENDAR_OAUTH_SCOPES,
].join(' ')

export function hasGoogleCalendarScopes(scope: string | null | undefined): boolean {
  const granted = new Set((scope ?? '').split(/\s+/).filter(Boolean))
  return GOOGLE_CALENDAR_OAUTH_SCOPES.every(required => granted.has(required))
}

type StoredGoogleAccount = {
  id: string
  provider: string
  access_token: string | null
  refresh_token: string | null
  scope: string | null
}

export function selectGoogleCalendarAccount<T extends StoredGoogleAccount>(
  accounts: readonly T[],
  requestedId?: string,
): T | null {
  return accounts.find(account =>
    account.provider === 'google'
    && (!requestedId || account.id === requestedId)
    && Boolean(account.access_token)
    && Boolean(account.refresh_token)
    && hasGoogleCalendarScopes(account.scope)
  ) ?? null
}