export const dynamic = 'force-dynamic'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { apiError, apiSuccess, parseBody } from '@/lib/api'
import { z } from 'zod'
import {
  CALENDAR_SYNC_DIRECTIONS,
  CALENDAR_SYNC_EVENT_TYPES,
  calendarSyncSelection,
  exactPreviewMatches,
  outgoingCalendarEventPreview,
  stableIdempotencyKey,
  type OutgoingPreviewEvent,
} from '@/lib/calendar-core'
import { cancelCalendarPullJob, enqueueCalendarSync, ensureCalendarPullJob } from '@/lib/calendar-server'
import { prepareExclusiveCalendarTarget } from '@/lib/calendar-target'
const schema = z.object({ externalCalendarId: z.string().trim().min(1).max(500), calendarName: z.string().trim().max(500).nullable().optional(), direction: z.enum(CALENDAR_SYNC_DIRECTIONS).default('two_way'), eventTypes: z.array(z.enum(CALENDAR_SYNC_EVENT_TYPES)).max(CALENDAR_SYNC_EVENT_TYPES.length).default([]), enabled: z.boolean().default(true), deletionPolicy: z.enum(['delete_local', 'mark_cancelled', 'leave_local']).default('mark_cancelled'), defaultVisibility: z.enum(['private', 'household', 'work_forwarded']).default('private'), confirm: z.boolean().default(false), confirmedPreview: z.unknown().optional() })
function publicSetting(setting: {
  id: string
  externalCalendarId: string
  calendarName: string | null
  direction: string
  eventTypes: string[]
  enabled: boolean
  deletionPolicy: string
  defaultVisibility: string
}) {
  return {
    id: setting.id,
    externalCalendarId: setting.externalCalendarId,
    calendarName: setting.calendarName,
    direction: setting.direction,
    eventTypes: setting.eventTypes,
    enabled: setting.enabled,
    deletionPolicy: setting.deletionPolicy,
    defaultVisibility: setting.defaultVisibility,
  }
}
export async function GET(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await auth(); if (!s?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401); const { id } = await params
  const c = await prisma.calendarProviderConnection.findFirst({ where: { id, userId: (s.user as any).id }, include: { settings: true } }); return c ? apiSuccess({ settings: c.settings.map(publicSetting) }) : apiError('NOT_FOUND', 'Calendar connection not found', 404)
}
export async function PUT(r: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await auth(); if (!s?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401); const { id } = await params; const p = await parseBody(r, schema); if (!p.success) return p.response
  const c = await prisma.calendarProviderConnection.findFirst({ where: { id, userId: (s.user as any).id } }); if (!c) return apiError('NOT_FOUND', 'Calendar connection not found', 404)
  const { confirm, confirmedPreview, ...rawSetting } = p.data
  const setting = {
    ...rawSetting,
    ...calendarSyncSelection(rawSetting.direction ?? 'two_way', rawSetting.eventTypes ?? []),
  }
  const eventTypes = setting.eventTypes
  const requiresConfirmation = c.provider === 'google' && setting.enabled && setting.direction !== 'provider_to_syntropic'
  const previousTargets = setting.enabled ? await prisma.calendarSyncSetting.findMany({
    where: {
      enabled: true,
      connection: { userId: (s.user as any).id, provider: 'google' },
      NOT: { connectionId: id, externalCalendarId: setting.externalCalendarId },
    },
    select: { externalCalendarId: true },
  }) : []
  const previousCalendarIds = [...new Set(previousTargets.map(target => target.externalCalendarId))]
  const events = requiresConfirmation ? await prisma.event.findMany({
    where: {
      userId: (s.user as any).id,
      type: eventTypes.length ? { in: eventTypes } : undefined,
      OR: [
        {
          syncStatus: { in: ['pending', 'error'] },
          OR: [{ externalCalendarId: null }, { externalCalendarId: setting.externalCalendarId }],
        },
        ...(previousCalendarIds.length ? [{
          externalProvider: 'google' as const,
          externalCalendarId: { in: previousCalendarIds },
        }] : []),
      ],
    },
    include: {
      inviteDecisions: true,
      medicalForwardingConsents: { where: { destinationCalendarId: setting.externalCalendarId, revokedAt: null } },
    },
    orderBy: [{ startDatetime: 'asc' }, { id: 'asc' }],
  }) : []
  const selectedEventIds = new Set<string>()
  const inviteeIds = events.flatMap(event => event.inviteDecisions
    .filter(decision => decision.decision === 'rule_selected' || decision.decision === 'manually_added')
    .map(decision => decision.personId))
  const invitees = inviteeIds.length ? await prisma.person.findMany({
    where: { userId: (s.user as any).id, id: { in: inviteeIds }, email: { not: null } },
    select: { id: true, email: true },
  }) : []
  const emailsByPerson = new Map(invitees.map(person => [person.id, person.email!]))
  const outgoingEvents = events.flatMap(event => {
    const previewEvent = event.externalCalendarId && event.externalCalendarId !== setting.externalCalendarId
      ? { ...event, externalEventId: null, externalEtag: null }
      : event
    if (event.type === 'medical') {
      const forwarded = (event.medicalForwardingConsents[0]?.preview as { event?: Record<string, unknown> } | undefined)?.event
      if (!forwarded || typeof forwarded.title !== 'string') return []
      selectedEventIds.add(event.id)
      return [{
        ...outgoingCalendarEventPreview(previewEvent as OutgoingPreviewEvent),
        title: forwarded.title,
        location: typeof forwarded.location === 'string' ? forwarded.location : null,
        notes: typeof forwarded.notes === 'string' ? forwarded.notes : null,
        attendees: Array.isArray(forwarded.attendees) ? forwarded.attendees.filter((email): email is string => typeof email === 'string') : [],
        visibility: 'private' as const,
      }]
    }
    selectedEventIds.add(event.id)
    return [outgoingCalendarEventPreview({
      ...previewEvent,
      attendeeEmails: event.inviteDecisions
        .filter(decision => decision.decision === 'rule_selected' || decision.decision === 'manually_added')
        .flatMap(decision => emailsByPerson.get(decision.personId) ?? []),
    } as OutgoingPreviewEvent)]
  })
  const preview = {
    provider: c.provider,
    destination: { connectionId: id, externalCalendarId: setting.externalCalendarId, calendarName: setting.calendarName ?? null },
    activation: {
      direction: setting.direction,
      eventTypes,
      enabled: setting.enabled,
      deletionPolicy: setting.deletionPolicy,
      defaultVisibility: setting.defaultVisibility,
    },
    outgoingEvents,
  }
  if (requiresConfirmation && !confirm) return apiSuccess({ preview, requiresExplicitConfirmation: true, activated: false })
  if (requiresConfirmation && !exactPreviewMatches(preview, confirmedPreview)) return apiError('CONFLICT', 'Outgoing calendar preview changed; review it again before confirming', 409)
  const key = stableIdempotencyKey(['google-activation', id, setting.externalCalendarId, JSON.stringify(preview)])
  const saved = await prisma.$transaction(async tx => {
    if (setting.enabled) await prepareExclusiveCalendarTarget(tx, {
      connectionId: id,
      userId: (s.user as any).id,
      externalCalendarId: setting.externalCalendarId,
    })
    const result = await tx.calendarSyncSetting.upsert({ where: { connectionId_externalCalendarId: { connectionId: id, externalCalendarId: setting.externalCalendarId } }, create: { connectionId: id, ...setting }, update: setting })
    await tx.calendarIdempotencyKey.upsert({
      where: { userId_operation_key: { userId: (s.user as any).id, operation: 'google-calendar-activation', key } },
      create: { userId: (s.user as any).id, operation: 'google-calendar-activation', key, resourceType: 'calendar_sync_setting', resourceId: result.id, result: preview },
      update: {},
    })
    return result
  })
  const queued = await Promise.all(events
    .filter(event => selectedEventIds.has(event.id))
    .map(event => enqueueCalendarSync(
      (s.user as any).id,
      event.id,
      event.externalEventId && event.externalCalendarId === setting.externalCalendarId ? 'update' : 'create',
      { connectionId: id, externalCalendarId: setting.externalCalendarId },
    )))
  const pullJob = saved.enabled && saved.direction !== 'syntropic_to_provider'
    ? await ensureCalendarPullJob(id, saved.externalCalendarId, saved.direction)
    : await cancelCalendarPullJob(id, saved.externalCalendarId, 'Calendar target no longer imports provider changes')
  return apiSuccess({ setting: publicSetting(saved), preview, activated: true, queued, pullScheduled: pullJob && 'id' in pullJob ? { id: pullJob.id, scheduledAt: pullJob.scheduledAt } : null })
}