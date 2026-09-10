import type { Account as AuthAccount } from 'next-auth'
import { prisma } from '@/lib/db'
import { hasGoogleCalendarScopes, selectGoogleCalendarAccount } from '@/lib/calendar-scopes'
import { CalendarProviderError } from '@/lib/calendar-provider'
import { safeRelativeCallback } from '@/lib/safe-callback'

export const GOOGLE_CALENDAR_CONNECTION_REQUIRED_MESSAGE =
  'Google Calendar access was not granted. You can try again whenever you’re ready.'

export const CALENDAR_PERMISSION_ERROR_CONTRACT = {
  consentRequired: {
    code: 'CALENDAR_CONSENT_REQUIRED',
    message: 'Google Calendar access is needed. Connect Google Calendar to continue.',
    status: 409,
    details: { reconnectRequired: true },
  },
  accessExpired: {
    code: 'CALENDAR_ACCESS_EXPIRED',
    message: 'Google Calendar access has expired. Reconnect Google Calendar to continue.',
    status: 409,
    details: { reconnectRequired: true },
  },
  accessRevoked: {
    code: 'CALENDAR_ACCESS_REVOKED',
    message: 'Google Calendar access was revoked. Reconnect Google Calendar to continue.',
    status: 409,
    details: { reconnectRequired: true },
  },
} as const
export const CALENDAR_CONNECTION_ERROR_CONTRACT = {
  unauthorized: {
    code: 'UNAUTHORIZED',
    message: 'Authentication required',
    status: 401,
  },
  missingGrant: {
    code: 'CONFLICT',
    message: GOOGLE_CALENDAR_CONNECTION_REQUIRED_MESSAGE,
    status: 409,
    details: { connectRequired: true },
  },
} as const

type PublicCalendarConnection = {
  id: string
  provider: string
  displayName: string | null
  status: string
  deletionPolicy: string
  connectedAt: Date
  disconnectedAt: Date | null
  lastSyncedAt: Date | null
  lastSyncError: string | null
  createdAt: Date
  updatedAt: Date
  settings?: readonly unknown[]
}

/**
 * Calendar connection records are also returned to the Events client. Keep
 * this an explicit allowlist so account identifiers and credential references
 * cannot cross the API boundary when the Prisma model gains private fields.
 */
export function publicCalendarConnection(connection: PublicCalendarConnection) {
  return {
    id: connection.id,
    provider: connection.provider,
    displayName: connection.displayName,
    status: connection.status,
    deletionPolicy: connection.deletionPolicy,
    connectedAt: connection.connectedAt,
    disconnectedAt: connection.disconnectedAt,
    lastSyncedAt: connection.lastSyncedAt,
    lastSyncError: connection.lastSyncError,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
    ...(connection.settings === undefined ? {} : { settings: connection.settings }),
  }
}

/**
 * Calendar provider routes deliberately expose a smaller contract than the
 * provider boundary. Provider messages can contain account or OAuth details,
 * so only these stable messages and the bounded retry hint may cross the API.
 */
export const CALENDAR_PROVIDER_ERROR_CONTRACT = {
  reconnectRequired: {
    code: 'CONFLICT',
    message: 'Google Calendar permission is missing or expired. Reconnect Google Calendar.',
    status: 409,
    details: { reconnectRequired: true },
  },
  unavailable: {
    code: 'INTERNAL_ERROR',
    message: 'Google Calendar is temporarily unavailable. Try again later.',
    status: 503,
  },
} as const

const DEFAULT_CALENDAR_RETRY_AFTER_SECONDS = 30
const MAX_CALENDAR_RETRY_AFTER_SECONDS = 60 * 60

export function calendarProviderErrorContract(status?: number, retryAfter?: number) {
  if (status === 401) return CALENDAR_PROVIDER_ERROR_CONTRACT.reconnectRequired

  const retryAfterSeconds = typeof retryAfter === 'number' && Number.isFinite(retryAfter)
    ? Math.min(Math.max(Math.ceil(retryAfter!), 1), MAX_CALENDAR_RETRY_AFTER_SECONDS)
    : DEFAULT_CALENDAR_RETRY_AFTER_SECONDS
  return {
    ...CALENDAR_PROVIDER_ERROR_CONTRACT.unavailable,
    details: { retryAfterSeconds },
  }
}

export type CalendarFailureRoute = 'list-calendars' | 'sync-now'
export type CalendarRecoveryFailureClass = 'provider' | 'application'

/**
 * Staging can exercise the route diagnostics without depending on a live
 * Google outage. The explicit non-production marker is required in addition
 * to the feature flag so a copied staging setting cannot silently enable this
 * probe in another environment. The header is intentionally ignored unless
 * both server-side settings are present.
 */
export function stagingCalendarRecoveryFailure(
  request: Request,
  route: CalendarFailureRoute,
) {
  if (
    process.env.CALENDAR_RECOVERY_STAGING !== '1'
    || process.env.CALENDAR_RECOVERY_STAGING_ENVIRONMENT !== 'NON_PRODUCTION'
  ) return null

  const requested = request.headers.get('x-syntropic-calendar-recovery')
  const providerProbe = `${route}:provider`
  const applicationProbe = `${route}:application`
  if (requested === providerProbe) {
    return new CalendarProviderError('staging Calendar provider recovery probe', 503, 999999)
  }
  if (requested === applicationProbe) {
    return new Error('staging Calendar application recovery probe')
  }
  return null
}

/**
 * Keep Calendar route diagnostics deliberately smaller than the provider error
 * boundary. In particular, never pass the caught error to the logger because
 * provider errors can contain response payloads, credentials, account IDs, or
 * redirect values.
 */
export function logCalendarFailure(route: CalendarFailureRoute, error: unknown) {
  const errorClass = error instanceof CalendarProviderError
    ? 'CalendarProviderError'
    : error instanceof Error
      ? 'ApplicationError'
      : 'UnknownError'

  console.error('Calendar route failure', { route, errorClass })
}

/**
 * Keep a declined Calendar grant in the Events flow. Only the known Events
 * callback is eligible; all other destinations are left to the normal auth
 * recovery path.
 */
export function calendarOAuthCancellationCallback(callback: string | null | undefined) {
  const safeCallback = safeRelativeCallback(callback)
  const parsed = new URL(safeCallback, 'https://ishiki.invalid')
  if (parsed.pathname !== '/events' || parsed.searchParams.get('calendarOAuth') !== 'complete') return null

  parsed.searchParams.set('calendarOAuth', 'cancelled')
  return `${parsed.pathname}${parsed.search}${parsed.hash}`
}

export type CalendarGrantPersistence =
  | 'not-calendar-grant'
  | 'new-account'
  | 'updated'
  | 'account-mismatch'
  | 'missing-refresh-token'

/**
 * Auth.js does not update adapter Account tokens when an already-linked OAuth
 * account signs in. Persist an explicit Calendar scope upgrade/reconnect here.
 * New accounts are left to the adapter so its normal link transaction remains
 * the single creator.
 */
export async function persistExistingGoogleCalendarGrant(
  userId: string,
  grant: AuthAccount,
): Promise<CalendarGrantPersistence> {
  if (
    grant.provider !== 'google'
    || !grant.providerAccountId
    || !grant.access_token
    || !hasGoogleCalendarScopes(grant.scope)
  ) return 'not-calendar-grant'

  const existing = await prisma.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider: 'google',
        providerAccountId: grant.providerAccountId,
      },
    },
  })
  if (!existing) return 'new-account'
  if (existing.userId !== userId) return 'account-mismatch'

  const refreshToken = grant.refresh_token ?? existing.refresh_token
  if (!refreshToken) return 'missing-refresh-token'

  await prisma.account.update({
    where: { id: existing.id },
    data: {
      access_token: grant.access_token,
      refresh_token: refreshToken,
      expires_at: grant.expires_at,
      token_type: grant.token_type,
      scope: grant.scope,
      id_token: grant.id_token,
      session_state: typeof grant.session_state === 'string' ? grant.session_state : null,
    },
  })
  return 'updated'
}

export async function connectGoogleCalendarAccount(
  userId: string,
  options: { requestedAccountId?: string; displayName?: string },
) {
  const accounts = await prisma.account.findMany({
    where: { userId, provider: 'google' },
    orderBy: { id: 'desc' },
  })
  const account = selectGoogleCalendarAccount(accounts, options.requestedAccountId)
  if (!account) return null

  // The compound unique key makes repeated callbacks and concurrent callback
  // requests converge on the same row instead of racing find-then-create.
  return prisma.calendarProviderConnection.upsert({
    where: {
      userId_provider_providerAccountId: {
        userId,
        provider: 'google',
        providerAccountId: account.providerAccountId,
      },
    },
    update: {
      ...(options.displayName === undefined ? {} : { displayName: options.displayName }),
      credentialReference: account.id,
      status: 'pending',
      disconnectedAt: null,
      lastSyncError: null,
    },
    create: {
      userId,
      provider: 'google',
      providerAccountId: account.providerAccountId,
      displayName: options.displayName,
      credentialReference: account.id,
      status: 'pending',
    },
  })
}
