/** Pure, provider-neutral calendar rules. Provider adapters own all I/O. */

export type CalendarEvent = {
  id: string
  type: string
  title: string
  startDatetime: Date
  endDatetime: Date | null
  location: string | null
  notes: string | null
  tags: string[]
  peopleRefs: string[]
  recurrenceTemplateId?: string | null
  travelMinutesBefore?: number | null
  onlineUrl?: string | null
  isCancelled?: boolean
  syncVersion?: number
  linkedCostAmount?: number | null
  costOverrideAmount?: number | null
}

export type InviteRule = {
  id: string
  enabled: boolean
  medicalRule: boolean
  eventTypes: string[]
  tags: string[]
  linkedPersonIds: string[]
  recurringTemplateId?: string | null
  locationMatcher?: string | null
  minimumTravelMinutes?: number | null
  inviteePersonIds: string[]
  firstMatchConfirmedAt?: Date | null
}

export type ForwardedEvent = Pick<CalendarEvent, 'title' | 'startDatetime' | 'endDatetime' | 'location' | 'notes'> & {
  attendees: string[]
  visibility: 'private'
  redacted: boolean
}

export type OutgoingCalendarEventPreview = {
  eventId: string
  externalEventId: string | null
  externalEtag: string | null
  title: string
  start: Date
  end: Date | null
  allDay: boolean
  timezone: null
  location: string | null
  notes: string | null
  recurrence: string[] | null
  status: 'confirmed' | 'cancelled'
  attendees: string[]
  visibility: 'default' | 'private'
}

export type OutgoingPreviewEvent = CalendarEvent & {
  externalEventId?: string | null
  externalEtag?: string | null
  allDay?: boolean
  recurrenceRule?: string | null
  attendeeEmails?: string[]
}

export const CALENDAR_SYNC_EVENT_TYPES = ['personal', 'appointment', 'medical', 'work', 'reminder', 'pet'] as const
export const CALENDAR_SYNC_DIRECTIONS = ['syntropic_to_provider', 'provider_to_syntropic', 'two_way'] as const
export type CalendarSyncEventType = typeof CALENDAR_SYNC_EVENT_TYPES[number]
export type CalendarSyncDirection = typeof CALENDAR_SYNC_DIRECTIONS[number]

export function calendarSyncSelection(
  direction: CalendarSyncDirection,
  eventTypes: readonly string[],
): { direction: CalendarSyncDirection; eventTypes: CalendarSyncEventType[] } {
  const allowed = new Set<string>(CALENDAR_SYNC_EVENT_TYPES)
  return {
    direction,
    eventTypes: [...new Set(eventTypes)]
      .filter((eventType): eventType is CalendarSyncEventType => allowed.has(eventType)),
  }
}

export type CalendarConflictDisplaySnapshot = {
  available: boolean
  title: string | null
  start: string | null
  end: string | null
  allDay: boolean | null
  location: string | null
  notes: string | null
  recurrence: string[]
  attendees: string[]
  visibility: 'default' | 'private' | null
  status: 'confirmed' | 'cancelled' | null
  etag: string | null
  reason: string | null
}

const displayDate = (value: unknown): string | null => {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString()
  if (typeof value !== 'string') return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

/** Whitelists only event-comparison fields before a conflict reaches the client. */
export function calendarConflictSnapshotForDisplay(value: unknown): CalendarConflictDisplaySnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const title = typeof record.title === 'string' ? record.title : null
  const start = displayDate(record.start ?? record.startDatetime)
  const allDay = typeof record.allDay === 'boolean' ? record.allDay : null
  const visibility = record.visibility === 'default' || record.visibility === 'private' ? record.visibility : null
  const status = record.status === 'confirmed' || record.status === 'cancelled' ? record.status : null
  const strings = (candidate: unknown) => Array.isArray(candidate)
    ? candidate.filter((item): item is string => typeof item === 'string')
    : []
  return {
    available: title !== null && start !== null && allDay !== null,
    title,
    start,
    end: displayDate(record.end ?? record.endDatetime),
    allDay,
    location: typeof record.location === 'string' ? record.location : null,
    notes: typeof record.notes === 'string' ? record.notes : null,
    recurrence: strings(record.recurrence),
    attendees: strings(record.attendees),
    visibility,
    status,
    etag: typeof record.etag === 'string' ? record.etag : null,
    reason: typeof record.reason === 'string' ? record.reason : null,
  }
}

/** The complete event payload that an outbound provider sync can disclose. */
export function outgoingCalendarEventPreview(event: OutgoingPreviewEvent): OutgoingCalendarEventPreview {
  return {
    eventId: event.id,
    externalEventId: event.externalEventId ?? null,
    externalEtag: event.externalEtag ?? null,
    title: event.title,
    start: event.startDatetime,
    end: event.endDatetime,
    allDay: event.allDay ?? false,
    timezone: null,
    location: event.location,
    notes: event.notes,
    recurrence: event.recurrenceRule
      ? [event.recurrenceRule.startsWith('RRULE:') ? event.recurrenceRule : `RRULE:${event.recurrenceRule}`]
      : null,
    status: event.isCancelled ? 'cancelled' : 'confirmed',
    attendees: [...(event.attendeeEmails ?? [])],
    visibility: 'default',
  }
}

/** JSON-safe exact comparison used to bind confirmation to the preview shown. */
export function exactPreviewMatches(expected: unknown, confirmed: unknown): boolean {
  return JSON.stringify(expected) === JSON.stringify(confirmed)
}

/** Medical consent is invalidated by any subsequent event mutation. */
export function medicalConsentMatchesVersion(preview: unknown, syncVersion: number): boolean {
  if (!preview || typeof preview !== 'object') return false
  return (preview as { eventVersion?: unknown }).eventVersion === syncVersion
}

export function medicalForwardingNeedsConsent(eventType: string, isCancelled: boolean, externalEventId: string | null): boolean {
  return eventType === 'medical' && !(isCancelled && Boolean(externalEventId))
}

export function invitationNotificationKey(eventId: string, personId: string, version: number, action: 'sent' | 'updated' | 'cancelled'): string {
  return stableIdempotencyKey(['invitation', eventId, personId, String(version), action])
}

/** Rules are considered in their stable order; each person is selected only once. */
export function selectedInviteesForEvent(event: CalendarEvent, rules: readonly InviteRule[]): Array<{ personId: string; ruleId: string }> {
  const selected = new Set<string>()
  const result: Array<{ personId: string; ruleId: string }> = []
  for (const rule of rules) {
    if (ruleRequiresFirstMatchConfirmation(rule) || !matchesInviteRule(event, rule)) continue
    for (const personId of rule.inviteePersonIds) {
      if (selected.has(personId)) continue
      selected.add(personId)
      result.push({ personId, ruleId: rule.id })
    }
  }
  return result
}

export function stableIdempotencyKey(parts: readonly string[]): string {
  return parts.map((part) => `${part.length}:${part}`).join('|')
}

export const CALENDAR_PULL_INTERVAL_MS = 5 * 60_000
export const CALENDAR_PULL_JOB_PREFIX = `${'calendar-pull'.length}:calendar-pull|`

export function calendarPullJobKey(connectionId: string, externalCalendarId: string): string {
  return stableIdempotencyKey(['calendar-pull', connectionId, externalCalendarId])
}

export function isCalendarPullJobKey(key: string): boolean {
  return key.startsWith(CALENDAR_PULL_JOB_PREFIX)
}

export function nextCalendarPullAt(now = new Date(), intervalMs = CALENDAR_PULL_INTERVAL_MS): Date {
  return new Date(now.getTime() + intervalMs)
}

/** Bounded exponential retry scheduling shared by durable calendar workers. */
export function calendarRetryAt(attemptCount: number, now = new Date(), retryAfter?: number): Date {
  const delay = retryAfter != null
    ? Math.min(Math.max(retryAfter * 1000, 1_000), 60 * 60_000)
    : Math.min(1_000 * 2 ** Math.max(0, attemptCount - 1), 15 * 60_000)
  return new Date(now.getTime() + delay)
}

export function calendarEventMatchesTypes(eventType: string, eventTypes: readonly string[]): boolean {
  return eventTypes.length === 0 || eventTypes.includes(eventType)
}

export function recurrenceRuleFromProvider(recurrence?: readonly string[] | null): string | null {
  return recurrence?.find(rule => rule.startsWith('RRULE:'))?.slice('RRULE:'.length) ?? null
}

/** Converts a stored provider conflict snapshot only when it is actionable. */
export function providerVersionEventData(version: unknown) {
  if (!version || typeof version !== 'object') return null
  const value = version as Record<string, unknown>
  if (typeof value.title !== 'string' || !value.start) return null
  const start = new Date(value.start as string | number | Date)
  const end = value.end == null ? null : new Date(value.end as string | number | Date)
  if (Number.isNaN(start.getTime()) || (end && Number.isNaN(end.getTime()))) return null
  return {
    title: value.title, startDatetime: start, endDatetime: end,
    allDay: typeof value.allDay === 'boolean' ? value.allDay : false,
    location: typeof value.location === 'string' ? value.location : null,
    notes: typeof value.notes === 'string' ? value.notes : null,
    recurrenceRule: Array.isArray(value.recurrence) ? recurrenceRuleFromProvider(value.recurrence.filter((rule): rule is string => typeof rule === 'string')) : null,
    externalEtag: typeof value.etag === 'string' ? value.etag : null,
    isCancelled: value.status === 'cancelled',
    syncStatus: 'synced' as const, syncError: null, lastSyncedAt: new Date(),
  }
}

export function isDuplicateOperation(existingKeys: ReadonlySet<string>, key: string): boolean {
  return existingKeys.has(key)
}

/** A conflict exists only when both sides changed after their shared base. */
export function hasSyncConflict<T>(base: T, local: T, provider: T, equal: (a: T, b: T) => boolean): boolean {
  return !equal(base, local) && !equal(base, provider) && !equal(local, provider)
}

export function matchesInviteRule(event: CalendarEvent, rule: InviteRule): boolean {
  if (!rule.enabled) return false
  if (event.type === 'medical' && !rule.medicalRule) return false
  if (rule.eventTypes.length && !rule.eventTypes.includes(event.type)) return false
  if (rule.tags.length && !rule.tags.some((tag) => event.tags.includes(tag))) return false
  if (rule.linkedPersonIds.length && !rule.linkedPersonIds.some((id) => event.peopleRefs.includes(id))) return false
  if (rule.recurringTemplateId && rule.recurringTemplateId !== event.recurrenceTemplateId) return false
  if (rule.locationMatcher && !event.location?.toLocaleLowerCase().includes(rule.locationMatcher.toLocaleLowerCase())) return false
  if (rule.minimumTravelMinutes != null && (event.travelMinutesBefore ?? 0) < rule.minimumTravelMinutes) return false
  // Cost deliberately does not participate in matching or invitation payloads.
  return true
}

export function ruleRequiresFirstMatchConfirmation(rule: InviteRule): boolean {
  return rule.firstMatchConfirmedAt == null
}

export function materialGuestUpdate(previous: CalendarEvent, next: CalendarEvent): boolean {
  return previous.startDatetime.getTime() !== next.startDatetime.getTime()
    || previous.endDatetime?.getTime() !== next.endDatetime?.getTime()
    || previous.location !== next.location
    || previous.title !== next.title
    || previous.notes !== next.notes
    || Boolean(previous.isCancelled) !== Boolean(next.isCancelled)
}

type InvitationDeliveryDecision = {
  personId: string
  decision: 'rule_selected' | 'manually_added' | 'manually_removed' | 'blocked'
  invitationStatus: 'pending' | 'sent' | 'updated' | 'cancelled' | 'blocked' | 'failed'
  lastNotifiedVersion: number | null
}

export type InvitationDeliveryPlan = {
  attendees: string[]
  sent: string[]
  updated: string[]
  cancelled: string[]
}

export function invitationDeliveryPlan(
  decisions: readonly InvitationDeliveryDecision[],
  emails: ReadonlyMap<string, string>,
  version: number,
): InvitationDeliveryPlan {
  const active = decisions.filter(decision =>
    (decision.decision === 'rule_selected' || decision.decision === 'manually_added')
    && emails.has(decision.personId),
  )
  const pendingActive = active.filter(decision => decision.invitationStatus === 'pending')
  return {
    attendees: active.map(decision => emails.get(decision.personId)!),
    sent: pendingActive
      .filter(decision => decision.lastNotifiedVersion == null)
      .map(decision => decision.personId),
    updated: pendingActive
      .filter(decision => decision.lastNotifiedVersion != null && decision.lastNotifiedVersion < version)
      .map(decision => decision.personId),
    cancelled: decisions
      .filter(decision =>
        (decision.decision === 'manually_removed' || decision.decision === 'blocked')
        && decision.invitationStatus === 'pending'
        && decision.lastNotifiedVersion != null
        && decision.lastNotifiedVersion < version,
      )
      .map(decision => decision.personId),
  }
}

export function guestNotificationMode(delivery: InvitationDeliveryPlan | null): 'all' | 'none' {
  return delivery && (delivery.sent.length || delivery.updated.length || delivery.cancelled.length)
    ? 'all'
    : 'none'
}

export function forwardingPreview(
  event: CalendarEvent,
  attendeeEmails: readonly string[],
  explicitFullMedicalDetailOptIn = false,
): ForwardedEvent {
  const isMedical = event.type === 'medical'
  if (isMedical && !explicitFullMedicalDetailOptIn) {
    return {
      title: 'Private appointment',
      startDatetime: event.startDatetime,
      endDatetime: event.endDatetime,
      location: null,
      notes: null,
      attendees: [],
      visibility: 'private',
      redacted: true,
    }
  }
  return {
    title: event.title,
    startDatetime: event.startDatetime,
    endDatetime: event.endDatetime,
    location: event.location,
    notes: event.notes,
    attendees: [...attendeeEmails],
    visibility: 'private',
    redacted: false,
  }
}

export type PrivateTravelBlock = {
  eventId: string
  startDatetime: Date
  endDatetime: Date
  travelMinutes: number
  isPrivate: true
  attendeeIds: []
}

/** Travel is an independent private block, never an alteration of guest event data. */
export function createPrivateTravelBlock(event: CalendarEvent, featureEnabled: boolean): PrivateTravelBlock | null {
  const minutes = event.travelMinutesBefore
  if (!featureEnabled || !minutes || minutes < 1 || !event.location || event.onlineUrl) return null
  const endDatetime = new Date(event.startDatetime)
  const startDatetime = new Date(endDatetime.getTime() - minutes * 60_000)
  return { eventId: event.id, startDatetime, endDatetime, travelMinutes: minutes, isPrivate: true, attendeeIds: [] }
}