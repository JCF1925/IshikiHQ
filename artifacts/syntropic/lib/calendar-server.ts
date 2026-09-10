import { prisma } from '@/lib/db'
import { GoogleCalendarProvider, type CalendarProvider } from '@/lib/calendar-provider'
import { CalendarProviderError } from '@/lib/calendar-provider'
import {
  matchesInviteRule,
  stableIdempotencyKey,
  calendarRetryAt,
  calendarEventMatchesTypes,
  recurrenceRuleFromProvider,
  providerVersionEventData,
  medicalConsentMatchesVersion,
  medicalForwardingNeedsConsent,
  invitationDeliveryPlan,
  guestNotificationMode,
  calendarPullJobKey,
  isCalendarPullJobKey,
  nextCalendarPullAt,
  CALENDAR_PULL_JOB_PREFIX,
  type CalendarEvent,
  type InviteRule,
} from '@/lib/calendar-core'
import { completeInvitationNotifications } from '@/lib/calendar-invitations'
import { hasGoogleCalendarScopes } from './calendar-scopes.ts'
import { calendarProviderErrorContract } from './calendar-oauth-server'

/** Database-only credential resolver. Do not import from client code. */
export async function providerForConnection(connectionId: string): Promise<CalendarProvider | null> {
  const connection = await prisma.calendarProviderConnection.findUnique({ where: { id: connectionId } })
  if (!connection || connection.status === 'disabled' || connection.disconnectedAt || connection.provider !== 'google') return null
  if (!connection.credentialReference) return null
  const account = await prisma.account.findFirst({ where: { id: connection.credentialReference, userId: connection.userId, provider: 'google' } })
  if (!account?.access_token || !account.refresh_token || !hasGoogleCalendarScopes(account.scope)) return null
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) return null // safe offline/disconnected degradation
  return new GoogleCalendarProvider({
    accessToken: account.access_token, refreshToken: account.refresh_token,
    expiresAt: account.expires_at ? new Date(account.expires_at * 1000) : null, clientId, clientSecret,
    onTokenRefresh: async token => {
      await prisma.account.update({ where: { id: account.id }, data: {
        access_token: token.accessToken, refresh_token: token.refreshToken ?? account.refresh_token,
        expires_at: Math.floor(token.expiresAt.getTime() / 1000),
      } })
    },
  })
}

export async function disableCalendarConnectionLocally(
  connection: { id: string; userId: string; credentialReference: string | null },
  reason: string,
  lastSyncError: string | null,
) {
  const completedAt = new Date()
  await prisma.$transaction([
    ...(connection.credentialReference ? [
      prisma.account.updateMany({
        where: { id: connection.credentialReference, userId: connection.userId, provider: 'google' },
        data: { access_token: null, refresh_token: null, expires_at: null },
      }),
    ] : []),
    prisma.calendarProviderConnection.update({
      where: { id: connection.id },
      data: { status: 'disabled', disconnectedAt: completedAt, credentialReference: null, lastSyncError },
    }),
    prisma.calendarSyncJob.updateMany({
      where: { connectionId: connection.id, status: { in: ['queued', 'failed', 'running'] } },
      data: { status: 'cancelled', completedAt, error: reason },
    }),
  ])
}

/** Durable, de-duplicated sync work. A worker may consume queued jobs later. */
export async function enqueueCalendarSync(
  userId: string,
  eventId: string,
  operation: 'create' | 'update' | 'delete',
  target?: { connectionId: string; externalCalendarId: string },
) {
  // Version participates so retrying one mutation is idempotent without
  // suppressing a later legitimate edit of the same event.
  const event = await prisma.event.findFirst({ where: { id: eventId, userId }, select: { syncVersion: true } })
  if (!event) return { queued: false, key: '' }
  const key = stableIdempotencyKey(['event', eventId, operation, String(event.syncVersion), target?.connectionId ?? 'all', target?.externalCalendarId ?? 'all'])
  const settings = await prisma.calendarSyncSetting.findMany({
    where: {
      enabled: true,
      connection: { userId, status: { not: 'disabled' }, disconnectedAt: null },
      ...(target ? { connectionId: target.connectionId, externalCalendarId: target.externalCalendarId } : {}),
    },
    select: { connectionId: true, externalCalendarId: true, direction: true },
  })
  const eligibleSettings = settings.filter(setting => operation === 'delete' || setting.direction !== 'provider_to_syntropic')
  if (!eligibleSettings.length) return { queued: false, key }
  const prior = await prisma.calendarIdempotencyKey.findUnique({ where: { userId_operation_key: { userId, operation: `event:${operation}`, key } } })
  if (prior) return { queued: false, key }
  await prisma.$transaction(async tx => {
    await tx.calendarIdempotencyKey.create({ data: { userId, operation: `event:${operation}`, key, resourceType: 'event', resourceId: eventId } })
    await tx.calendarSyncJob.createMany({ data: eligibleSettings
      .map(setting => ({ connectionId: setting.connectionId, externalCalendarId: setting.externalCalendarId, direction: setting.direction, idempotencyKey: stableIdempotencyKey([key, setting.connectionId, setting.externalCalendarId]) })) })
  })
  return { queued: true, key }
}

async function applyConfirmedInviteRules(userId: string, event: NonNullable<Awaited<ReturnType<typeof prisma.event.findFirst>>>) {
  const rules = await prisma.calendarInviteRule.findMany({ where: { userId, enabled: true, firstMatchConfirmedAt: { not: null } } })
  const matching = rules.filter(rule => matchesInviteRule(event as CalendarEvent, rule as InviteRule))
  for (const rule of matching) {
    for (const personId of rule.inviteePersonIds) {
      const person = await prisma.person.findFirst({ where: { id: personId, userId, email: { not: null } }, select: { id: true } })
      if (!person) continue
      await prisma.eventInviteDecision.upsert({
        where: { eventId_personId: { eventId: event.id, personId } },
        create: { eventId: event.id, personId, ruleId: rule.id, decision: 'rule_selected', invitationStatus: 'pending' },
        update: {},
      })
    }
  }
}

export const providerEventData = (
  event: Awaited<ReturnType<typeof prisma.event.findFirst>>,
  overrides: {
    title?: string
    location?: string | null
    notes?: string | null
    attendees?: string[]
    visibility?: 'default' | 'private'
    sendUpdates?: 'all' | 'none'
  } = {},
) => {
  if (!event) throw new Error('Event not found')
  return { id: event.externalEventId ?? undefined, etag: event.externalEtag ?? undefined, title: overrides.title ?? event.title,
    start: event.startDatetime, end: event.endDatetime, allDay: event.allDay,
    timezone: undefined, location: overrides.location ?? event.location, notes: overrides.notes ?? event.notes,
    recurrence: event.recurrenceRule ? [event.recurrenceRule.startsWith('RRULE:') ? event.recurrenceRule : `RRULE:${event.recurrenceRule}`] : null,
    status: event.isCancelled ? 'cancelled' as const : 'confirmed' as const,
    attendees: overrides.attendees,
    visibility: overrides.visibility ?? 'default',
    sendUpdates: overrides.sendUpdates ?? 'none' }
}

async function invitationDelivery(eventId: string, version: number) {
  const decisions = await prisma.eventInviteDecision.findMany({ where: { eventId } })
  const people = await prisma.person.findMany({
    where: { id: { in: decisions.map(decision => decision.personId) }, email: { not: null } },
    select: { id: true, email: true },
  })
  const emails = new Map(people.map(person => [person.id, person.email!]))
  return invitationDeliveryPlan(decisions, emails, version)
}
/** Executes one due job synchronously for API-triggered sync and worker consumers. */
export async function executeCalendarSyncJob(jobId: string, now = new Date(), providerOverride?: CalendarProvider) {
  const job = await claimCalendarSyncJob(jobId, now)
  if (!job) return { skipped: true }
  const connection = job.connection
  const recurringPull = isCalendarPullJobKey(job.idempotencyKey)
  const settings = connection.settings.filter(s => s.enabled && (!job.externalCalendarId || s.externalCalendarId === job.externalCalendarId))
  if (!settings.length || (recurringPull && !settings.some(setting => setting.direction !== 'syntropic_to_provider'))) {
    await prisma.calendarSyncJob.updateMany({
      where: { id: job.id, status: 'running' },
      data: { status: 'cancelled', completedAt: now, error: 'Calendar target is disabled or no longer imports provider changes' },
    })
    return { cancelled: true }
  }
  if (connection.status === 'disabled' || connection.disconnectedAt) {
    await prisma.calendarSyncJob.updateMany({
      where: { id: job.id, status: 'running' },
      data: { status: 'cancelled', completedAt: now, error: 'Calendar provider is disconnected' },
    })
    return { disconnected: true, cancelled: true }
  }
  const provider = providerOverride ?? await providerForConnection(connection.id)
  if (!provider) {
    // An intentionally disconnected/offline connection is not a failed mutation:
    // leave it usable and retry infrequently instead of burning all attempts.
    await prisma.calendarSyncJob.updateMany({ where: { id: job.id, status: 'running' }, data: { status: 'queued', scheduledAt: new Date(now.getTime() + OFFLINE_RETRY_MS), completedAt: null, error: 'Calendar provider is disconnected or unavailable' } })
    return { disconnected: true }
  }
  try {
    for (const setting of settings) {
      await hydrateConflictSnapshots(connection.id, provider, setting.externalCalendarId)
      if (setting.direction !== 'provider_to_syntropic') {
        const local = await prisma.event.findMany({ where: { userId: connection.userId, syncStatus: { in: ['pending', 'error'] }, type: setting.eventTypes.length ? { in: setting.eventTypes } : undefined, OR: [{ externalCalendarId: null }, { externalCalendarId: setting.externalCalendarId }] } })
        for (const event of local) {
          if (!event.isCancelled) await applyConfirmedInviteRules(connection.userId, event)
          if (event.isCancelled && event.externalEventId) {
            const delivery = event.type === 'medical' ? null : await invitationDelivery(event.id, event.syncVersion)
            await provider.cancelEvent(setting.externalCalendarId, event.externalEventId, event.externalEtag ?? undefined)
            await prisma.event.update({ where: { id: event.id }, data: { syncStatus: 'cancelled', lastSyncedAt: new Date() } })
            if (delivery) await completeInvitationNotifications(connection.userId, event.id, event.syncVersion, 'cancelled', [...delivery.sent, ...delivery.updated, ...delivery.cancelled])
            continue
          }
          let outboundOverrides: Parameters<typeof providerEventData>[1] = {}
          if (medicalForwardingNeedsConsent(event.type, event.isCancelled, event.externalEventId)) {
            const consent = await prisma.eventMedicalForwardingConsent.findUnique({
              where: { eventId_destinationCalendarId: { eventId: event.id, destinationCalendarId: setting.externalCalendarId } },
            })
            if (!consent || consent.revokedAt) continue
            if (!medicalConsentMatchesVersion(consent.preview, event.syncVersion)) {
              await prisma.$transaction([
                prisma.eventMedicalForwardingConsent.update({ where: { id: consent.id }, data: { revokedAt: new Date() } }),
                prisma.event.update({ where: { id: event.id }, data: { syncStatus: 'error', syncError: 'Medical forwarding consent expired after the event changed; review and confirm the outgoing preview again' } }),
              ])
              continue
            }
            const forwarded = (consent.preview as { event?: { title?: unknown; location?: unknown; notes?: unknown; attendees?: unknown } }).event
            if (!forwarded || typeof forwarded.title !== 'string') continue
            outboundOverrides = {
              title: forwarded.title,
              location: typeof forwarded.location === 'string' ? forwarded.location : null,
              notes: typeof forwarded.notes === 'string' ? forwarded.notes : null,
              attendees: Array.isArray(forwarded.attendees) ? forwarded.attendees.filter((email): email is string => typeof email === 'string') : [],
              visibility: 'private',
            }
          }
          const delivery = event.type === 'medical' ? null : await invitationDelivery(event.id, event.syncVersion)
          outboundOverrides.sendUpdates = guestNotificationMode(delivery)
          if (delivery) outboundOverrides.attendees = delivery.attendees
          const outbound = providerEventData(event, outboundOverrides)
          try {
            const remote = await provider.upsertEvent(setting.externalCalendarId, outbound)
            await prisma.event.update({ where: { id: event.id }, data: { externalProvider: 'google', externalCalendarId: setting.externalCalendarId, externalEventId: remote.id, externalEtag: remote.etag ?? null, syncStatus: 'synced', syncError: null, lastSyncedAt: new Date() } })
            if (delivery) {
              if (delivery.sent.length) await completeInvitationNotifications(connection.userId, event.id, event.syncVersion, 'sent', delivery.sent)
              if (delivery.updated.length) await completeInvitationNotifications(connection.userId, event.id, event.syncVersion, 'updated', delivery.updated)
              if (delivery.cancelled.length) await completeInvitationNotifications(connection.userId, event.id, event.syncVersion, 'cancelled', delivery.cancelled)
            }
          } catch (error) {
            if (error instanceof CalendarProviderError && error.status === 412) {
              const existing = await prisma.calendarSyncConflict.findFirst({ where: { eventId: event.id, connectionId: connection.id, resolvedAt: null } })
              let remoteVersion: ReturnType<typeof providerSnapshot> | { etag: string | null; reason: string } = { etag: event.externalEtag, reason: 'Provider version changed' }
              let snapshotError: unknown
              if (event.externalEventId) {
                try { remoteVersion = providerSnapshot(await provider.getEvent(setting.externalCalendarId, event.externalEventId)) } catch (error) { snapshotError = error }
              }
              if (existing) await prisma.calendarSyncConflict.update({ where: { id: existing.id }, data: { providerVersion: JSON.parse(JSON.stringify(remoteVersion)) } })
              else await prisma.calendarSyncConflict.create({ data: { eventId: event.id, connectionId: connection.id, localVersion: JSON.parse(JSON.stringify(outbound)), providerVersion: JSON.parse(JSON.stringify(remoteVersion)) } })
              await prisma.event.update({ where: { id: event.id }, data: { syncStatus: 'conflict', syncError: 'Provider version changed' } })
              if (snapshotError) throw snapshotError
              continue
            }
            throw error
          }
        }
      }
      if (setting.direction !== 'syntropic_to_provider') {
        await pullCalendar(connection, provider, setting)
      }
    }
    await prisma.calendarProviderConnection.update({ where: { id: connection.id }, data: { lastSyncedAt: new Date(), lastSyncError: null, status: 'synced' } })
    if (recurringPull) {
      const activeTarget = await prisma.calendarSyncSetting.findFirst({
        where: {
          connectionId: connection.id,
          externalCalendarId: job.externalCalendarId ?? undefined,
          enabled: true,
          direction: { in: ['provider_to_syntropic', 'two_way'] },
          connection: { status: { not: 'disabled' }, disconnectedAt: null },
        },
        select: { id: true },
      })
      const rescheduled = activeTarget ? await prisma.calendarSyncJob.updateMany({
        where: { id: job.id, status: 'running' },
        data: {
          status: 'queued',
          attemptCount: 0,
          scheduledAt: nextCalendarPullAt(now),
          startedAt: null,
          completedAt: null,
          error: null,
        },
      }) : await prisma.calendarSyncJob.updateMany({
        where: { id: job.id, status: 'running' },
        data: { status: 'cancelled', completedAt: now, error: 'Calendar target was disabled while polling' },
      })
      return { succeeded: true, rescheduled: Boolean(activeTarget && rescheduled.count) }
    }
    await prisma.calendarSyncJob.updateMany({ where: { id: job.id, status: 'running' }, data: { status: 'succeeded', completedAt: new Date() } })
    return { succeeded: true }
  } catch (error) {
    const providerError = error instanceof CalendarProviderError ? error : null
    const message = providerError?.message ?? 'Calendar sync failed'
    const safeProviderError = calendarProviderErrorContract(providerError?.status, providerError?.retryAfter)
    if (providerError?.status === 401) {
      await disableCalendarConnectionLocally(connection, message, safeProviderError.message)
      return { succeeded: false, disabled: true, error: message }
    }
    const deadLetter = job.attemptCount >= CALENDAR_SYNC_MAX_ATTEMPTS
    const recurringNextCycle = recurringPull && deadLetter
    await prisma.calendarSyncJob.updateMany({
      where: { id: job.id, status: 'running' },
      data: {
        status: recurringNextCycle ? 'queued' : deadLetter ? 'dead_letter' : 'failed',
        attemptCount: recurringNextCycle ? 0 : undefined,
        startedAt: recurringNextCycle ? null : undefined,
        completedAt: recurringNextCycle ? null : new Date(),
        scheduledAt: recurringNextCycle ? nextCalendarPullAt(now) : deadLetter ? now : calendarRetryAt(job.attemptCount, now, providerError?.retryAfter),
        error: message,
      },
    })
    await prisma.calendarProviderConnection.update({ where: { id: connection.id }, data: { lastSyncError: safeProviderError.message } })
    return { succeeded: false, deadLetter: deadLetter && !recurringNextCycle, rescheduled: recurringNextCycle, error: message }
  }
}

export const CALENDAR_SYNC_MAX_ATTEMPTS = 5

function providerSnapshot(remote: Awaited<ReturnType<CalendarProvider['getEvent']>>) {
  if (remote.status === 'cancelled') {
    return {
      etag: remote.etag ?? null,
      status: 'cancelled' as const,
      reason: 'The provider event was deleted before a complete comparison snapshot could be loaded',
    }
  }
  return {
    title: remote.title, start: remote.start, end: remote.end, allDay: remote.allDay,
    location: remote.location ?? null, notes: remote.notes ?? null, recurrence: remote.recurrence ?? null,
    etag: remote.etag ?? null, status: remote.status ?? 'confirmed',
  }
}

async function hydrateConflictSnapshots(connectionId: string, provider: CalendarProvider, externalCalendarId: string) {
  const conflicts = await prisma.calendarSyncConflict.findMany({
    where: { connectionId, resolvedAt: null },
    include: { event: true },
  })
  for (const conflict of conflicts) {
    if (providerVersionEventData(conflict.providerVersion)) continue
    if (conflict.event.externalCalendarId !== externalCalendarId || !conflict.event.externalEventId) continue
    const remote = await provider.getEvent(externalCalendarId, conflict.event.externalEventId)
    await prisma.calendarSyncConflict.update({
      where: { id: conflict.id },
      data: { providerVersion: JSON.parse(JSON.stringify(providerSnapshot(remote))) },
    })
  }
}

/**
 * Atomically transitions a due queued/retryable job to running.  updateMany is
 * deliberately used as a compare-and-set so two worker processes cannot claim
 * the same row.
 */
export async function claimCalendarSyncJob(jobId: string, now = new Date()) {
  const claimed = await prisma.calendarSyncJob.updateMany({
    where: { id: jobId, status: { in: ['queued', 'failed'] }, scheduledAt: { lte: now } },
    data: { status: 'running', startedAt: now, attemptCount: { increment: 1 }, error: null },
  })
  if (!claimed.count) return null
  return prisma.calendarSyncJob.findUnique({ where: { id: jobId }, include: { connection: { include: { settings: true } } } })
}

async function saveProviderPage(connection: { id: string; userId: string }, setting: { externalCalendarId: string; deletionPolicy: 'delete_local' | 'mark_cancelled' | 'leave_local'; eventTypes: string[] }, remote: Awaited<ReturnType<CalendarProvider['listEvents']>>['events'][number]) {
  const local = await prisma.event.findFirst({ where: { userId: connection.userId, externalProvider: 'google', externalCalendarId: setting.externalCalendarId, externalEventId: remote.id } })
  if (local?.syncStatus === 'conflict') return
  if (remote.status === 'cancelled') {
    if (local && setting.deletionPolicy === 'delete_local') await prisma.event.delete({ where: { id: local.id } })
    else if (local && setting.deletionPolicy === 'mark_cancelled') await prisma.event.update({ where: { id: local.id }, data: { isCancelled: true, syncStatus: 'cancelled' } })
    return
  }
  // Provider calendars do not expose Ishiki event types. Imported events are
  // personal, so a restrictive setting that excludes personal must not import.
  if (!calendarEventMatchesTypes(local?.type ?? 'personal', setting.eventTypes)) return
  const data = { title: remote.title, startDatetime: remote.start, endDatetime: remote.end, allDay: remote.allDay, location: remote.location ?? null, notes: remote.notes ?? null, recurrenceRule: recurrenceRuleFromProvider(remote.recurrence), externalEtag: remote.etag ?? null, lastSyncedAt: new Date(), syncStatus: 'synced' as const, syncError: null }
  if (local) await prisma.event.update({ where: { id: local.id }, data })
  else await prisma.event.create({ data: { userId: connection.userId, type: 'personal', peopleRefs: [], tags: [], source: 'calendar_sync', externalProvider: 'google', externalCalendarId: setting.externalCalendarId, externalEventId: remote.id, ...data } })
}

/** Claims and executes a bounded batch of jobs without relying on sync-now. */
export async function processDueCalendarSyncJobs(limit = 25, now = new Date()) {
  await reconcileCalendarPullJobs(now)
  const candidates = await prisma.calendarSyncJob.findMany({
    where: { status: { in: ['queued', 'failed'] }, scheduledAt: { lte: now } },
    orderBy: { scheduledAt: 'asc' }, take: limit, select: { id: true },
  })
  const results = []
  for (const candidate of candidates) results.push(await executeCalendarSyncJob(candidate.id, now))
  return results
}

const OFFLINE_RETRY_MS = 60 * 60_000

type CalendarSyncDirection = 'syntropic_to_provider' | 'provider_to_syntropic' | 'two_way'

async function pullCalendar(connection: { id: string; userId: string }, provider: CalendarProvider, setting: { externalCalendarId: string; deletionPolicy: 'delete_local' | 'mark_cancelled' | 'leave_local'; eventTypes: string[] }) {
  const stored = await prisma.calendarSyncCursor.findUnique({ where: { connectionId_externalCalendarId: { connectionId: connection.id, externalCalendarId: setting.externalCalendarId } } })
  let syncToken = stored?.cursor ?? null
  let resetAttempted = false
  for (;;) {
    try {
      let pageToken: string | null = null
      let finalCursor: string | undefined
      do {
        // syncToken remains constant for every page; pageToken is only pagination.
        const page = await provider.listEvents(setting.externalCalendarId, syncToken, pageToken)
        for (const remote of page.events) await saveProviderPage(connection, setting, remote)
        pageToken = page.nextPageToken ?? null
        if (!pageToken) finalCursor = page.cursor
      } while (pageToken)
      if (finalCursor) await prisma.calendarSyncCursor.upsert({ where: { connectionId_externalCalendarId: { connectionId: connection.id, externalCalendarId: setting.externalCalendarId } }, create: { connectionId: connection.id, externalCalendarId: setting.externalCalendarId, cursor: finalCursor, lastSuccessfulSyncAt: new Date() }, update: { cursor: finalCursor, lastSuccessfulSyncAt: new Date() } })
      return
    } catch (error) {
      if (error instanceof CalendarProviderError && error.status === 410 && syncToken && !resetAttempted) {
        resetAttempted = true
        syncToken = null
        await prisma.calendarSyncCursor.upsert({ where: { connectionId_externalCalendarId: { connectionId: connection.id, externalCalendarId: setting.externalCalendarId } }, create: { connectionId: connection.id, externalCalendarId: setting.externalCalendarId, cursor: null }, update: { cursor: null } })
        continue
      }
      throw error
    }
  }
}

export async function cancelCalendarPullJobsForConnection(connectionId: string, reason: string) {
  return prisma.calendarSyncJob.updateMany({
    where: {
      connectionId,
      idempotencyKey: { startsWith: CALENDAR_PULL_JOB_PREFIX },
      status: { in: ['queued', 'failed', 'running'] },
    },
    data: { status: 'cancelled', completedAt: new Date(), error: reason },
  })
}

export async function reconcileCalendarPullJobs(now = new Date()) {
  const settings = await prisma.calendarSyncSetting.findMany({
    where: {
      enabled: true,
      direction: { in: ['provider_to_syntropic', 'two_way'] },
      connection: { status: { not: 'disabled' }, disconnectedAt: null },
    },
    select: { connectionId: true, externalCalendarId: true, direction: true },
  })
  const activeKeys = settings.map(setting => calendarPullJobKey(setting.connectionId, setting.externalCalendarId))
  const jobs = await Promise.all(settings.map(setting =>
    ensureCalendarPullJob(setting.connectionId, setting.externalCalendarId, setting.direction, now, false),
  ))
  const cancelled = await prisma.calendarSyncJob.updateMany({
    where: {
      idempotencyKey: {
        startsWith: CALENDAR_PULL_JOB_PREFIX,
        ...(activeKeys.length ? { notIn: activeKeys } : {}),
      },
      status: { in: ['queued', 'failed', 'running'] },
    },
    data: {
      status: 'cancelled',
      completedAt: now,
      error: 'Calendar target is disabled, disconnected, or no longer imports provider changes',
    },
  })
  return { active: jobs.length, cancelled: cancelled.count }
}

export async function ensureCalendarPullJob(
  connectionId: string,
  externalCalendarId: string,
  direction: CalendarSyncDirection,
  scheduledAt = new Date(),
  makeDue = true,
) {
  if (direction === 'syntropic_to_provider') {
    await cancelCalendarPullJob(connectionId, externalCalendarId, 'Calendar target no longer imports provider changes')
    return null
  }
  const idempotencyKey = calendarPullJobKey(connectionId, externalCalendarId)
  const existing = await prisma.calendarSyncJob.findUnique({ where: { idempotencyKey } })
  if (existing?.status === 'running') return existing
  if (existing && !makeDue && (existing.status === 'queued' || existing.status === 'failed')) {
    return existing.direction === direction
      ? existing
      : prisma.calendarSyncJob.update({ where: { id: existing.id }, data: { direction } })
  }
  if (existing) {
    return prisma.calendarSyncJob.update({
      where: { id: existing.id },
      data: {
        connectionId,
        externalCalendarId,
        direction,
        status: 'queued',
        attemptCount: 0,
        scheduledAt,
        startedAt: null,
        completedAt: null,
        error: null,
      },
    })
  }
  try {
    return await prisma.calendarSyncJob.create({
      data: { connectionId, externalCalendarId, direction, idempotencyKey, scheduledAt },
    })
  } catch (error: any) {
    if (error?.code !== 'P2002') throw error
    return prisma.calendarSyncJob.findUniqueOrThrow({ where: { idempotencyKey } })
  }
}

export async function cancelCalendarPullJob(connectionId: string, externalCalendarId: string, reason: string) {
  return prisma.calendarSyncJob.updateMany({
    where: {
      idempotencyKey: calendarPullJobKey(connectionId, externalCalendarId),
      status: { in: ['queued', 'failed', 'running'] },
    },
    data: { status: 'cancelled', completedAt: new Date(), error: reason },
  })
}
