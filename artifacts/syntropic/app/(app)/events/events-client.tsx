'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Calendar as CalendarIcon, Plus, Trash2, MapPin, Video, Clock, ChevronLeft, ChevronRight, CalendarDays, List, Rss, Copy, RefreshCw, Cake } from 'lucide-react'
import { toast } from 'sonner'
import { signIn } from 'next-auth/react'
import { GOOGLE_CALENDAR_AUTH_SCOPE } from '@/lib/calendar-scopes'
import {
  CALENDAR_SYNC_DIRECTIONS,
  CALENDAR_SYNC_EVENT_TYPES,
  calendarSyncSelection,
  type CalendarSyncDirection,
} from '@/lib/calendar-core'
import { FadeIn } from '@/components/ui/animate'
import { SafeDate, SafeTime } from '@/components/safe-format'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

const typeColors: Record<string, string> = {
  medical: 'bg-red-500/20 text-red-400',
  work: 'bg-blue-500/20 text-blue-400',
  personal: 'bg-primary/20 text-primary',
  appointment: 'bg-purple-500/20 text-purple-400',
  reminder: 'bg-amber-500/20 text-amber-400',
  pet: 'bg-emerald-500/20 text-emerald-400',
}
const typeDot: Record<string, string> = {
  medical: 'bg-red-400', work: 'bg-blue-400', personal: 'bg-primary',
  appointment: 'bg-purple-400', reminder: 'bg-amber-400', pet: 'bg-emerald-400',
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const emptyForm = {
  title: '', type: 'personal', startDatetime: '', endDatetime: '',
  location: '', isOnline: false, allDay: false, notes: '', tags: '', annual: false,
}
type CalendarSyncDraft = {
  externalCalendarId: string
  direction: CalendarSyncDirection
  eventTypes: string[]
}
const emptySyncDraft: CalendarSyncDraft = { externalCalendarId: '', direction: 'two_way', eventTypes: [] }
type CalendarApiError = Error & {
  code?: string
  details?: { connectRequired?: boolean; reconnectRequired?: boolean }
}
type CalendarRecoveryNotice = {
  message: string
  actionLabel: string
}
const calendarRecoveryGuidance: Record<string, CalendarRecoveryNotice> = {
  CALENDAR_CONSENT_REQUIRED: {
    message: 'Google Calendar access is needed. Connect Google Calendar to continue.',
    actionLabel: 'Connect Google Calendar',
  },
  CALENDAR_ACCESS_EXPIRED: {
    message: 'Google Calendar access has expired. Reconnect Google Calendar to continue.',
    actionLabel: 'Reconnect Google Calendar',
  },
  CALENDAR_ACCESS_REVOKED: {
    message: 'Google Calendar access was revoked. Reconnect Google Calendar to continue.',
    actionLabel: 'Reconnect Google Calendar',
  },
}
const calendarRecoveryFor = (error: unknown): CalendarRecoveryNotice | null => {
  const calendarError = error as Partial<CalendarApiError> | null
  if (!calendarError?.code && !calendarError?.details?.connectRequired) return null
  if (calendarError.details?.connectRequired) return calendarRecoveryGuidance.CALENDAR_CONSENT_REQUIRED
  return calendarRecoveryGuidance[calendarError.code ?? ''] ?? null
}
const directionLabels: Record<CalendarSyncDirection, string> = {
  syntropic_to_provider: 'Ishiki → Google',
  provider_to_syntropic: 'Google → Ishiki',
  two_way: 'Two-way',
}
const draftFromSettings = (connectionSettings: any[]): CalendarSyncDraft => {
  const setting = connectionSettings.find((candidate) => candidate.enabled) ?? connectionSettings[0]
  if (!setting) return { ...emptySyncDraft }
  const direction = CALENDAR_SYNC_DIRECTIONS.includes(setting.direction)
    ? setting.direction as CalendarSyncDirection
    : 'two_way'
  const selection = calendarSyncSelection(direction, Array.isArray(setting.eventTypes) ? setting.eventTypes : [])
  return { externalCalendarId: setting.externalCalendarId ?? '', ...selection }
}

const activationPreviewForDisplay = (preview: any) => {
  if (!preview || typeof preview !== 'object') return preview
  const destination = preview.destination
  if (!destination || typeof destination !== 'object') return preview
  return {
    ...preview,
    destination: {
      calendarName: destination.calendarName || 'Selected Google calendar',
    },
  }
}
function ymd(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

export function EventsClient() {
  const [stored, setStored] = useState<any[]>([])
  const [derived, setDerived] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'calendar' | 'list'>('calendar')
  const [listTab, setListTab] = useState('upcoming')
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ ...emptyForm })
  const [cursor, setCursor] = useState<Date | null>(null)
  const [now, setNow] = useState<Date | null>(null)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [showSync, setShowSync] = useState(false)
  const [feed, setFeed] = useState<{ url: string } | null>(null)
  const [connections, setConnections] = useState<any[]>([])
  const [conflicts, setConflicts] = useState<any[]>([])
  const [inviteRules, setInviteRules] = useState<any[]>([])
  const [connectionCalendars, setConnectionCalendars] = useState<Record<string, any[]>>({})
  const [calendarListStatus, setCalendarListStatus] = useState<Record<string, 'loaded' | 'error'>>({})
  const [settings, setSettings] = useState<Record<string, any>>({})
  const [syncDrafts, setSyncDrafts] = useState<Record<string, CalendarSyncDraft>>({})
  const [calendarBusy, setCalendarBusy] = useState(false)
  const [calendarOAuthNotice, setCalendarOAuthNotice] = useState<string | null>(null)
  const [calendarRecovery, setCalendarRecovery] = useState<Record<string, CalendarRecoveryNotice>>({})
  const [newRuleName, setNewRuleName] = useState('')
  const [inviteePersonId, setInviteePersonId] = useState('')
  const [activationConfirmation, setActivationConfirmation] = useState<any>(null)
  const [pendingRuleMatches, setPendingRuleMatches] = useState<any[]>([])

  // Calendar routes return either their payload directly or the application's
  // conventional { data } envelope; accept both while keeping API errors visible.
  const api = useCallback(async (url: string, init?: RequestInit) => {
    const response = await fetch(url, init)
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      const error = new Error(payload?.error?.message ?? 'Calendar request failed') as CalendarApiError
      error.code = payload?.error?.code
      error.details = payload?.error?.details
      throw error
    }
    return payload?.data ?? payload
  }, [])

  const loadCalendarState = useCallback(async () => {
    try {
      const [connectionData, conflictData, ruleData] = await Promise.all([
        api('/api/calendar/connections'),
        api('/api/calendar/conflicts'),
        api('/api/calendar/invite-rules'),
      ])
      const nextConnections = Array.isArray(connectionData) ? connectionData : connectionData?.connections ?? []
      setConnections(nextConnections)
      setConflicts(conflictData?.conflicts ?? [])
      setInviteRules(ruleData?.rules ?? [])
      const details = await Promise.all(nextConnections.map(async (connection: any) => {
        let calendarData: any = { calendars: [] }
        let recovery: CalendarRecoveryNotice | null = null
        let calendarsLoaded = false
        try {
          calendarData = await api(`/api/calendar/connections/${connection.id}/calendars`)
          calendarsLoaded = true
        } catch (error) {
          recovery = calendarRecoveryFor(error)
        }
        const settingsData = await api(`/api/calendar/connections/${connection.id}/settings`)
        return {
          id: connection.id,
          calendars: calendarData?.calendars ?? [],
          calendarsLoaded,
          settings: settingsData?.settings ?? [],
          recovery,
        }
      }))
      setConnectionCalendars(Object.fromEntries(details.map(({ id, calendars }) => [id, calendars])))
      setCalendarListStatus(Object.fromEntries(details.map(({ id, calendarsLoaded }) => [id, calendarsLoaded ? 'loaded' : 'error'])))
      setSettings(Object.fromEntries(details.map(({ id, settings }) => [id, settings])))
      setSyncDrafts(Object.fromEntries(details.map(({ id, settings }) => [id, draftFromSettings(settings)])))
      setCalendarRecovery(Object.fromEntries(details.filter(({ recovery }) => recovery).map(({ id, recovery }) => [id, recovery])))
    } catch (error: any) {
      toast.error(calendarRecoveryFor(error)?.message ?? 'Failed to load calendar settings')
    }
  }, [api])

  const fetchEvents = useCallback(async () => {
    try {
      const [s, d] = await Promise.all([fetch('/api/events'), fetch('/api/events/annual')])
      if (!s.ok) throw new Error()
      const events = await s.json()
      const travelBlocks = await Promise.all((events as any[]).map(async (event) => {
        const response = await fetch(`/api/calendar/events/${event.id}/travel-block`)
        if (!response.ok) return [event.id, null] as const
        const payload = await response.json()
        return [event.id, payload?.travelBlock ?? null] as const
      }))
      const blocksByEventId = Object.fromEntries(travelBlocks)
      setStored((events as any[]).map((event) => ({ ...event, travelBlock: blocksByEventId[event.id] ?? null })))
      setDerived(d.ok ? await d.json() : [])
    } catch { toast.error('Failed to load events') }
    finally { setLoading(false) }
  }, [])

  const createGoogleConnection = useCallback(() => {
    setCalendarOAuthNotice(null)
    void signIn('google', { redirectTo: '/events?calendarOAuth=complete' }, {
      scope: GOOGLE_CALENDAR_AUTH_SCOPE,
      prompt: 'consent',
      access_type: 'offline',
      include_granted_scopes: 'true',
    })
  }, [])

  useEffect(() => { fetchEvents() }, [fetchEvents])
  useEffect(() => {
    const currentDate = new Date()
    setCursor(currentDate)
    setNow(currentDate)
  }, [])
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const calendarOAuth = params.get('calendarOAuth')
    if (calendarOAuth !== 'complete' && calendarOAuth !== 'cancelled') return
    params.delete('calendarOAuth')
    window.history.replaceState({}, '', `${window.location.pathname}${params.size ? `?${params}` : ''}`)
    setShowSync(true)
    if (calendarOAuth === 'cancelled') {
      setCalendarOAuthNotice('Google Calendar access was not granted. You can try again whenever you’re ready.')
      return
    }

    setCalendarOAuthNotice(null)
    setCalendarBusy(true)
    api('/api/calendar/connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'google', displayName: 'Google Calendar' }),
    })
      .then(async () => {
        toast.success('Google Calendar connected')
        await loadCalendarState()
      })
      .catch((error) => setCalendarOAuthNotice(calendarRecoveryFor(error)?.message ?? 'Google Calendar could not be connected. You can try again whenever you’re ready.'))
      .finally(() => setCalendarBusy(false))
  }, [api, createGoogleConnection, loadCalendarState])

  // Merge stored + derived, de-duplicating derived annual events that duplicate a stored source event on the same day.
  const allEvents = useMemo(() => {
    const storedKeys = new Set(stored.map((e: any) => `${e.id}`))
    const merged = [...stored.map((e: any) => ({ ...e, derived: false }))]
    for (const d of derived) {
      if (d.source === 'annual' && storedKeys.has(d.sourceId)) {
        // keep derived projection only if it is not the same calendar day as the stored original
        const orig = stored.find((s: any) => s.id === d.sourceId)
        if (orig && ymd(new Date(orig.startDatetime)) === ymd(new Date(d.startDatetime))) continue
      }
      merged.push(d)
    }
    return merged
  }, [stored, derived])

  const eventsByDay = useMemo(() => {
    const map: Record<string, any[]> = {}
    for (const e of allEvents) {
      const key = ymd(new Date(e.startDatetime))
      ;(map[key] ||= []).push(e)
    }
    for (const k of Object.keys(map)) map[k].sort((a, b) => new Date(a.startDatetime).getTime() - new Date(b.startDatetime).getTime())
    return map
  }, [allEvents])

  // Build month grid (Mon-first)
  const monthGrid = useMemo(() => {
    if (!cursor) return [] as Date[]
    const year = cursor.getFullYear()
    const month = cursor.getMonth()
    const first = new Date(year, month, 1)
    const startOffset = (first.getDay() + 6) % 7 // Mon=0
    const start = new Date(year, month, 1 - startOffset)
    const cells: Date[] = []
    for (let i = 0; i < 42; i++) cells.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
    return cells
  }, [cursor])

  const openAdd = (day?: string) => {
    setForm({ ...emptyForm, startDatetime: day ? `${day}T09:00` : '' })
    setShowAdd(true)
  }

  const handleAdd = async () => {
    if (!form.title || !form.startDatetime) { toast.error('Title and start date are required'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          recurrenceRule: form.annual ? 'annual' : null,
          tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
        }),
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok) throw new Error()
      const created = payload?.data ?? payload
      setPendingRuleMatches((created?.pendingInviteRules ?? []).map((rule: any) => ({ ...rule, eventId: created.id })))
      toast.success('Event added')
      setShowAdd(false)
      setForm({ ...emptyForm })
      fetchEvents()
    } catch { toast.error('Failed to add event') }
    finally { setSaving(false) }
  }

  const handleDelete = async (e: any) => {
    if (e.derived) {
      if (e.source === 'birthday') { toast.info('Edit the birthday on the People record to change this.'); return }
      if (!confirm('This is a recurring annual event. Delete the underlying event (removes all yearly repeats)?')) return
      try { await fetch(`/api/events/${e.sourceId}`, { method: 'DELETE' }); toast.success('Recurring event deleted'); fetchEvents() }
      catch { toast.error('Failed to delete') }
      return
    }
    if (!confirm('Delete this event?')) return
    try { await fetch(`/api/events/${e.id}`, { method: 'DELETE' }); toast.success('Event deleted'); fetchEvents() }
    catch { toast.error('Failed to delete') }
  }

  const openSync = async () => {
    setShowSync(true)
    loadCalendarState()
    if (!feed) {
      try { const res = await fetch('/api/calendar/token'); if (res.ok) setFeed(await res.json()) }
      catch { /* noop */ }
    }
  }
  const calendarAction = async (action: () => Promise<any>, message: string, connectionId?: string) => {
    setCalendarBusy(true)
    try { const result = await action(); toast.success(message); await loadCalendarState(); await fetchEvents(); return result }
    catch (error: any) {
      const recovery = calendarRecoveryFor(error)
      if (connectionId && recovery) setCalendarRecovery((current) => ({ ...current, [connectionId]: recovery }))
      else toast.error(recovery?.message ?? 'Calendar request failed')
    }
    finally { setCalendarBusy(false) }
  }
  const chooseProviderCalendar = (connectionId: string, externalCalendarId: string) => {
    const saved = (settings[connectionId] ?? []).find((setting: any) => setting.externalCalendarId === externalCalendarId)
    setSyncDrafts((drafts) => ({
      ...drafts,
      [connectionId]: saved
        ? draftFromSettings([saved])
        : { ...(drafts[connectionId] ?? emptySyncDraft), externalCalendarId },
    }))
  }
  const updateSyncDraft = (connectionId: string, update: Partial<CalendarSyncDraft>) => {
    setSyncDrafts((drafts) => ({
      ...drafts,
      [connectionId]: { ...(drafts[connectionId] ?? emptySyncDraft), ...update },
    }))
  }
  const saveSetting = async (connectionId: string) => {
    const draft = syncDrafts[connectionId] ?? emptySyncDraft
    if (!draft.externalCalendarId) { toast.error('Select a provider calendar'); return }
    const availableCalendars = connectionCalendars[connectionId] ?? []
    if (calendarListStatus[connectionId] === 'loaded' && !availableCalendars.some((calendar: any) => calendar.id === draft.externalCalendarId)) {
      toast.error('Select an available provider calendar')
      return
    }
    setCalendarBusy(true)
    try {
      const selection = calendarSyncSelection(draft.direction, draft.eventTypes)
      const setting = {
        externalCalendarId: draft.externalCalendarId,
        calendarName: connectionCalendars[connectionId]?.find((calendar: any) => calendar.id === draft.externalCalendarId)?.name ?? null,
        ...selection,
        enabled: true,
        deletionPolicy: 'mark_cancelled',
        defaultVisibility: 'private',
      }
      const result = await api(`/api/calendar/connections/${connectionId}/settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(setting) })
      if (result.requiresExplicitConfirmation) setActivationConfirmation({ connectionId, setting, preview: result.preview })
      else {
        toast.success('Calendar setting saved')
        await loadCalendarState()
      }
    } catch (error: any) { toast.error(error.message ?? 'Calendar request failed') }
    finally { setCalendarBusy(false) }
  }
  const confirmSetting = () => {
    if (!activationConfirmation) return
    const { connectionId, setting, preview } = activationConfirmation
    calendarAction(() => api(`/api/calendar/connections/${connectionId}/settings`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...setting, confirm: true, confirmedPreview: preview }),
    }), 'Google calendar activation confirmed').then(() => setActivationConfirmation(null))
  }
  const resolveConflict = (id: string, resolution: 'keep_local' | 'keep_provider' | 'manual') => calendarAction(
    () => api(`/api/calendar/conflicts/${id}/resolve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resolution }) }),
    'Conflict resolved',
  )
  const createInviteRule = () => {
    if (!newRuleName || !inviteePersonId) { toast.error('Rule name and person ID are required'); return }
    calendarAction(() => api('/api/calendar/invite-rules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newRuleName, inviteePersonIds: [inviteePersonId], eventTypes: [], tags: [] }) }), 'Invite rule saved')
  }
  const eventCalendarAction = (eventId: string, path: string, body: unknown, message: string) => calendarAction(
    () => api(`/api/calendar/events/${eventId}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), message,
  )
  const regenerate = async () => {
    try { const res = await fetch('/api/calendar/token', { method: 'POST' }); if (res.ok) { setFeed(await res.json()); toast.success('New link generated — old link disabled') } }
    catch { toast.error('Failed to regenerate') }
  }
  const copyUrl = () => { if (feed?.url) { navigator.clipboard?.writeText(feed.url); toast.success('Feed URL copied') } }

  const listEvents = useMemo(() => {
    if (!now) return []
    const arr = allEvents.filter((e: any) => listTab === 'upcoming' ? new Date(e.startDatetime) >= new Date(now.toDateString()) : new Date(e.startDatetime) < now)
    arr.sort((a, b) => (listTab === 'upcoming' ? 1 : -1) * (new Date(a.startDatetime).getTime() - new Date(b.startDatetime).getTime()))
    return arr
  }, [allEvents, listTab, now])

  const listGrouped = useMemo(() => {
    const g: Record<string, any[]> = {}
    for (const e of listEvents) { const k = ymd(new Date(e.startDatetime)); (g[k] ||= []).push(e) }
    return g
  }, [listEvents])

  const monthLabel = cursor ? cursor.toLocaleDateString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : ''
  const todayKey = now ? ymd(now) : ''

  return (
    <div className="space-y-6">
      <FadeIn>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2">
              <CalendarIcon className="h-6 w-6" /> Events &amp; Calendar
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Appointments, reminders, birthdays and annual events — all in one calendar.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={openSync}><Rss className="h-4 w-4 mr-2" /> Sync</Button>
            <Button onClick={() => openAdd(selectedDay ?? undefined)}><Plus className="h-4 w-4 mr-2" /> Add Event</Button>
          </div>
        </div>
      </FadeIn>

      {pendingRuleMatches.length > 0 && <Card><CardContent className="p-4 space-y-2">
        <h2 className="text-sm font-medium">Confirm first automatic invitations</h2>
        <p className="text-xs text-muted-foreground">These rules matched the event just created. No invitee is selected until you explicitly confirm its first match.</p>
        {pendingRuleMatches.map((match) => <div key={`${match.eventId}-${match.id}`} className="flex items-center justify-between gap-2 text-xs">
          <span>{match.name} · {match.inviteePersonIds.length} invitee(s)</span>
          <Button size="sm" variant="outline" onClick={() => calendarAction(() => api(`/api/calendar/invite-rules/${match.id}/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId: match.eventId }) }), 'First match confirmed').then(() => setPendingRuleMatches((items) => items.filter((item) => item !== match)))}>Confirm invitations</Button>
        </div>)}
      </CardContent></Card>}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="inline-flex rounded-lg border border-border p-0.5">
          <Button variant={view === 'calendar' ? 'default' : 'ghost'} size="sm" onClick={() => setView('calendar')}><CalendarDays className="h-4 w-4 mr-1.5" /> Calendar</Button>
          <Button variant={view === 'list' ? 'default' : 'ghost'} size="sm" onClick={() => setView('list')}><List className="h-4 w-4 mr-1.5" /> List</Button>
        </div>
        {view === 'calendar' && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon-sm" onClick={() => cursor && setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="text-sm font-medium w-40 text-center">{monthLabel}</span>
            <Button variant="ghost" size="icon-sm" onClick={() => cursor && setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>Today</Button>
          </div>
        )}
      </div>

      {loading ? (
        <Skeleton className="h-[520px]" />
      ) : view === 'calendar' ? (
        <FadeIn>
          <Card>
            <CardContent className="p-3">
              <div className="grid grid-cols-7 gap-px mb-1">
                {WEEKDAYS.map((d) => <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
                {monthGrid.map((d) => {
                  const key = ymd(d)
                  const inMonth = cursor ? d.getMonth() === cursor.getMonth() : false
                  const dayEvents = eventsByDay[key] ?? []
                  const isToday = key === todayKey
                  return (
                    <button
                      key={key}
                      onClick={() => { setSelectedDay(key) }}
                      onDoubleClick={() => openAdd(key)}
                      className={`min-h-[92px] text-left p-1.5 bg-card transition-colors hover:bg-muted/50 ${inMonth ? '' : 'opacity-40'} ${selectedDay === key ? 'ring-1 ring-primary ring-inset' : ''}`}
                    >
                      <div className={`text-xs font-medium mb-1 h-5 w-5 flex items-center justify-center rounded-full ${isToday ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>{d.getDate()}</div>
                      <div className="space-y-0.5">
                        {dayEvents.slice(0, 3).map((e: any) => (
                          <div key={e.id} className="flex items-center gap-1 text-[10px] truncate">
                            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${typeDot[e.type] ?? typeDot.personal}`} />
                            <span className="truncate">{e.source === 'birthday' ? '🎂 ' : ''}{e.title}</span>
                          </div>
                        ))}
                        {dayEvents.length > 3 && <div className="text-[10px] text-muted-foreground">+{dayEvents.length - 3} more</div>}
                      </div>
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {selectedDay && (
            <FadeIn>
              <Card className="mt-4">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium"><SafeDate date={selectedDay} options={{ weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }} /></h3>
                    <Button size="sm" variant="outline" onClick={() => openAdd(selectedDay)}><Plus className="h-3.5 w-3.5 mr-1" /> Add</Button>
                  </div>
                  {(eventsByDay[selectedDay] ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No events this day.</p>
                  ) : (
                    <div className="space-y-2">
                      {(eventsByDay[selectedDay] ?? []).map((e: any) => <EventRow key={e.id} e={e} onDelete={handleDelete} onCalendarAction={eventCalendarAction} />)}
                    </div>
                  )}
                </CardContent>
              </Card>
            </FadeIn>
          )}
        </FadeIn>
      ) : (
        <div className="space-y-4">
          <Tabs value={listTab} onValueChange={setListTab}>
            <TabsList>
              <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
              <TabsTrigger value="past">Past</TabsTrigger>
            </TabsList>
          </Tabs>
          {Object.keys(listGrouped).length === 0 ? (
            <Card className="py-12 text-center"><CalendarIcon className="h-12 w-12 mx-auto text-muted-foreground/30" /><p className="text-muted-foreground mt-4">No {listTab} events</p></Card>
          ) : (
            Object.entries(listGrouped).map(([k, evs]) => (
              <FadeIn key={k}>
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2"><SafeDate date={k} options={{ weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }} /></h3>
                  <div className="space-y-2">{evs.map((e: any) => <EventRow key={e.id} e={e} onDelete={handleDelete} onCalendarAction={eventCalendarAction} />)}</div>
                </div>
              </FadeIn>
            ))
          )}
        </div>
      )}

      {/* Add event dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add Event</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Title *</Label><Input value={form.title} onChange={(e: any) => setForm({ ...form, title: e.target.value })} placeholder="Cardiologist appointment" /></div>
            <div>
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v: string) => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{['personal', 'appointment', 'medical', 'work', 'reminder', 'pet'].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Start *</Label><Input type="datetime-local" value={form.startDatetime} onChange={(e: any) => setForm({ ...form, startDatetime: e.target.value })} /></div>
              <div><Label>End</Label><Input type="datetime-local" value={form.endDatetime} onChange={(e: any) => setForm({ ...form, endDatetime: e.target.value })} /></div>
            </div>
            <div><Label>Location</Label><Input value={form.location} onChange={(e: any) => setForm({ ...form, location: e.target.value })} placeholder="123 Collins St" /></div>
            <div className="flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-2"><Switch checked={form.isOnline} onCheckedChange={(c: boolean) => setForm({ ...form, isOnline: c })} /><Label>Online</Label></div>
              <div className="flex items-center gap-2"><Switch checked={form.allDay} onCheckedChange={(c: boolean) => setForm({ ...form, allDay: c })} /><Label>All day</Label></div>
              <div className="flex items-center gap-2"><Switch checked={form.annual} onCheckedChange={(c: boolean) => setForm({ ...form, annual: c })} /><Label>Repeats annually</Label></div>
            </div>
            <div><Label>Tags</Label><Input value={form.tags} onChange={(e: any) => setForm({ ...form, tags: e.target.value })} placeholder="birthday, health, family (comma separated)" /></div>
            <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e: any) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes" /></div>
            <Button onClick={handleAdd} className="w-full" loading={saving}>Add Event</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sync dialog */}
      <Dialog open={showSync} onOpenChange={setShowSync}>
        <DialogContent className="w-[calc(100%-1rem)] max-h-[90vh] overflow-y-auto p-4 sm:max-w-2xl sm:p-6">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Rss className="h-5 w-5" /> Calendar sync</DialogTitle></DialogHeader>
          <div className="space-y-4 text-sm">
            <DialogDescription>Subscribe to your Ishiki calendar from Google Calendar, Apple Calendar or Outlook. This one-way feed keeps every event, birthday and annual reminder in sync automatically.</DialogDescription>
            <div>
              <Label>Private feed URL</Label>
              <div className="flex gap-2 mt-1">
                <Input readOnly value={feed?.url ?? 'Generating…'} className="min-w-0 flex-1 font-mono text-xs" />
                <Button className="shrink-0" variant="outline" size="icon" onClick={copyUrl} disabled={!feed}><Copy className="h-4 w-4" /></Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Keep this private — anyone with the link can view your calendar.</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Add to Google Calendar</p>
              <p>Other calendars → <span className="text-foreground">+</span> → From URL → paste the link above.</p>
              <p className="font-medium text-foreground pt-1">Add to Apple Calendar</p>
              <p>File → New Calendar Subscription → paste the link.</p>
            </div>
            <div className="flex flex-col gap-2 border-t border-border/50 pt-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">Compromised link? Generate a new one (disables the old URL).</p>
              <Button className="self-start shrink-0 sm:self-auto" variant="outline" size="sm" onClick={regenerate}><RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Regenerate</Button>
            </div>
            <div className="border-t border-border/50 pt-3 space-y-3">
              {calendarOAuthNotice && (
                <div role="alert" className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
                  <p>{calendarOAuthNotice}</p>
                  <Button className="mt-2" size="sm" variant="outline" disabled={calendarBusy} onClick={createGoogleConnection}>
                    Try again
                  </Button>
                </div>
              )}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="font-medium">Provider connections</h3>
                <Button className="self-start sm:self-auto" size="sm" variant="outline" disabled={calendarBusy} onClick={createGoogleConnection}>Connect Google Calendar</Button>
              </div>
              {connections.length === 0 && <p className="text-xs text-muted-foreground">No provider connection yet. Connect Google and grant Calendar access to begin.</p>}
              {connections.map((connection) => {
                const draft = syncDrafts[connection.id] ?? emptySyncDraft
                const savedSettings = settings[connection.id] ?? []
                const availableCalendars = connectionCalendars[connection.id] ?? []
                const savedTarget = savedSettings.find((setting: any) => setting.enabled) ?? savedSettings[0]
                const unavailableSavedCalendar = calendarListStatus[connection.id] === 'loaded'
                  && savedTarget
                  && !availableCalendars.some((calendar: any) => calendar.id === savedTarget.externalCalendarId)
                  ? savedTarget
                  : null
                const calendarOptions = [
                  ...(unavailableSavedCalendar ? [{
                    id: unavailableSavedCalendar.externalCalendarId,
                    name: `${unavailableSavedCalendar.calendarName || 'Saved provider calendar'} (unavailable)`,
                    unavailable: true,
                  }] : []),
                  ...availableCalendars,
                ].filter((calendar, index, calendars) => calendars.findIndex((candidate) => candidate.id === calendar.id) === index)
                const unavailableSelection = unavailableSavedCalendar?.externalCalendarId === draft.externalCalendarId
                return (
                  <div key={connection.id} className="rounded-md border border-border p-3 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{connection.displayName || connection.provider}</span>
                      <Badge variant="outline">{connection.status}</Badge>
                    </div>
                     {calendarRecovery[connection.id] && (
                       <div role="alert" className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
                         <p>{calendarRecovery[connection.id].message}</p>
                         <Button className="mt-2" size="sm" variant="outline" disabled={calendarBusy} onClick={createGoogleConnection}>
                           {calendarRecovery[connection.id].actionLabel}
                         </Button>
                       </div>
                     )}
                    {unavailableSavedCalendar && (
                      <div role="alert" className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
                        <p className="font-medium">Saved provider calendar unavailable</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {unavailableSavedCalendar.calendarName
                            ? `"${unavailableSavedCalendar.calendarName}" is no longer available from Google. Select a replacement below. Your sync direction and event-type scope will stay the same.`
                            : 'The saved Google Calendar is no longer available. Select a replacement below. Your sync direction and event-type scope will stay the same.'}
                        </p>
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label>Provider calendar</Label>
                        <Select value={draft.externalCalendarId || undefined} onValueChange={(calendarId) => chooseProviderCalendar(connection.id, calendarId)}>
                          <SelectTrigger><SelectValue placeholder="Select provider calendar" /></SelectTrigger>
                          <SelectContent>{calendarOptions.map((calendar: any) => <SelectItem key={calendar.id} value={calendar.id} disabled={calendar.unavailable}>{calendar.name || 'Provider calendar'}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label>Sync direction</Label>
                        <Select value={draft.direction} onValueChange={(direction: CalendarSyncDirection) => updateSyncDraft(connection.id, { direction })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{CALENDAR_SYNC_DIRECTIONS.map((direction) => <SelectItem key={direction} value={direction}>{directionLabels[direction]}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <Label>Event type scope</Label>
                        <Select
                          value={draft.eventTypes.length ? 'selected' : 'all'}
                          onValueChange={(scope) => updateSyncDraft(connection.id, { eventTypes: scope === 'all' ? [] : (draft.eventTypes.length ? draft.eventTypes : ['personal']) })}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="all">All Ishiki event types</SelectItem><SelectItem value="selected">Only selected types</SelectItem></SelectContent>
                        </Select>
                      </div>
                      {draft.eventTypes.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 rounded-md bg-muted/40 p-3">
                          {CALENDAR_SYNC_EVENT_TYPES.map((eventType) => {
                            const checked = draft.eventTypes.includes(eventType)
                            return <div key={eventType} className="flex items-center gap-2">
                              <Switch
                                id={`${connection.id}-${eventType}`}
                                checked={checked}
                                disabled={checked && draft.eventTypes.length === 1}
                                onCheckedChange={(enabled) => updateSyncDraft(connection.id, {
                                  eventTypes: enabled
                                    ? [...new Set([...draft.eventTypes, eventType])]
                                    : draft.eventTypes.filter((selected) => selected !== eventType),
                                })}
                              />
                              <Label htmlFor={`${connection.id}-${eventType}`} className="capitalize text-xs">{eventType}</Label>
                            </div>
                          })}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" disabled={calendarBusy || !draft.externalCalendarId || unavailableSelection} onClick={() => saveSetting(connection.id)}>Review &amp; save settings</Button>
                      <Button size="sm" variant="outline" disabled={calendarBusy} onClick={() => calendarAction(() => api(`/api/calendar/connections/${connection.id}/sync-now`, { method: 'POST' }), 'Sync completed', connection.id)}>Sync now</Button>
                      {connection.status === 'disabled' && <Button size="sm" variant="outline" disabled={calendarBusy} onClick={createGoogleConnection}>Reconnect Google</Button>}
                      <Button size="sm" variant="destructive" disabled={calendarBusy} onClick={() => calendarAction(() => api(`/api/calendar/connections/${connection.id}/disconnect`, { method: 'POST' }), 'Connection disconnected')}>Disconnect</Button>
                    </div>
                    {(settings[connection.id] ?? []).length > 0 && (
                      <div className="space-y-1 text-xs text-muted-foreground">
                        {(settings[connection.id] as any[]).map((setting) => (
                          <p key={setting.id}>
                            Saved: {setting.calendarName || 'Provider calendar'} · {directionLabels[setting.direction as CalendarSyncDirection] ?? setting.direction} · {setting.eventTypes?.length ? setting.eventTypes.join(', ') : 'all event types'}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
              {activationConfirmation && <div className="rounded-md border border-amber-500/50 p-3 space-y-2">
                <p className="font-medium">Exact outgoing Google Calendar preview</p>
                <p className="text-xs text-muted-foreground">Review every field below. Activation does not occur until you confirm this exact preview.</p>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-[10px]">{JSON.stringify(activationPreviewForDisplay(activationConfirmation.preview), null, 2)}</pre>
                <div className="flex gap-2"><Button size="sm" disabled={calendarBusy} onClick={confirmSetting}>Confirm exact outgoing data</Button><Button size="sm" variant="outline" onClick={() => setActivationConfirmation(null)}>Cancel</Button></div>
              </div>}
            </div>
            <div className="border-t border-border/50 pt-3 space-y-2">
              <h3 className="font-medium">Sync conflicts</h3>
              {conflicts.length === 0 ? <p className="text-xs text-muted-foreground">No unresolved conflicts.</p> : conflicts.map((conflict) => (
                <div key={conflict.id} className="rounded-md border border-border p-3 space-y-3">
                  <p className="text-xs font-medium">{conflict.event?.title ?? 'Event'} · {conflict.connection?.displayName ?? conflict.connection?.provider}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <ConflictSnapshotPanel label="Ishiki version" snapshot={conflict.localSnapshot} />
                    <ConflictSnapshotPanel label="Provider version" snapshot={conflict.providerSnapshot} />
                  </div>
                  <p className="text-xs text-muted-foreground">Compare both versions before choosing. Resolution is disabled when a complete snapshot is unavailable.</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={calendarBusy || !conflict.localSnapshot?.available} onClick={() => resolveConflict(conflict.id, 'keep_local')}>Keep Ishiki version</Button>
                    <Button size="sm" variant="outline" disabled={calendarBusy || !conflict.providerSnapshot?.available} onClick={() => resolveConflict(conflict.id, 'keep_provider')}>Keep provider version</Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-border/50 pt-3 space-y-2">
              <h3 className="font-medium">Automatic invite rules</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2"><Input aria-label="Invite rule name" value={newRuleName} onChange={(e) => setNewRuleName(e.target.value)} placeholder="Rule name" /><Input aria-label="Invitee person ID" value={inviteePersonId} onChange={(e) => setInviteePersonId(e.target.value)} placeholder="Invitee person ID" /><Button size="sm" disabled={calendarBusy} onClick={createInviteRule}>Add rule</Button></div>
              {inviteRules.map((rule) => <div key={rule.id} className="flex items-center justify-between text-xs"><span>{rule.name}</span>{!rule.firstMatchConfirmedAt && <Badge variant="outline">awaiting first matching event</Badge>}</div>)}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ConflictSnapshotPanel({ label, snapshot }: { label: string; snapshot: any }) {
  if (!snapshot?.available) {
    return (
      <div className="rounded-md bg-muted/40 p-3 text-xs">
        <p className="font-medium">{label}</p>
        <p className="mt-2 text-muted-foreground">{snapshot?.reason ?? 'A complete event snapshot is not available yet. Run sync again before resolving.'}</p>
      </div>
    )
  }
  const dateTime = (value: string | null) => value
    ? new Date(value).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })
    : '—'
  const rows: Array<[string, string]> = [
    ['Title', snapshot.title ?? 'Untitled'],
    ['Starts', dateTime(snapshot.start)],
    ['Ends', dateTime(snapshot.end)],
    ['All day', snapshot.allDay ? 'Yes' : 'No'],
    ['Location', snapshot.location ?? 'Not set'],
    ['Notes', snapshot.notes ?? 'Not set'],
    ['Recurrence', snapshot.recurrence?.length ? snapshot.recurrence.join(', ') : 'None'],
    ['Attendees', snapshot.attendees?.length ? snapshot.attendees.join(', ') : 'None'],
    ['Visibility', snapshot.visibility ?? 'Default'],
    ['Status', snapshot.status ?? 'Confirmed'],
    ['Provider version', snapshot.etag ?? 'Not supplied'],
  ]
  return (
    <div className="rounded-md bg-muted/40 p-3 text-xs">
      <p className="font-medium mb-2">{label}</p>
      <dl className="grid grid-cols-[6rem_1fr] gap-x-2 gap-y-1 break-words">
        {rows.map(([name, value]) => <div key={name} className="contents"><dt className="text-muted-foreground">{name}</dt><dd>{value}</dd></div>)}
      </dl>
    </div>
  )
}

function EventRow({ e, onDelete, onCalendarAction }: { e: any; onDelete: (e: any) => void; onCalendarAction: (eventId: string, path: string, body: unknown, message: string) => void }) {
  const [personId, setPersonId] = useState('')
  const [destinationCalendarId, setDestinationCalendarId] = useState('')
  const [fullMedicalDetails, setFullMedicalDetails] = useState(false)
  const [medicalPreview, setMedicalPreview] = useState<any>(null)
  const [medicalBusy, setMedicalBusy] = useState(false)
  const medicalRequest = async (confirm: boolean) => {
    setMedicalBusy(true)
    try {
      const response = await fetch(`/api/calendar/events/${e.id}/medical-forwarding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destinationCalendarId,
          attendeeEmails: [],
          fullDetails: fullMedicalDetails,
          confirm,
          previewHash: confirm ? medicalPreview?.previewHash : undefined,
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error?.message ?? 'Medical forwarding request failed')
      const result = payload?.data ?? payload
      if (confirm) {
        toast.success('Medical forwarding confirmed')
        setMedicalPreview(null)
      } else {
        setMedicalPreview(result)
      }
    } catch (error: any) {
      toast.error(error.message ?? 'Medical forwarding request failed')
    } finally {
      setMedicalBusy(false)
    }
  }
  return (
    <Card className="transition-all hover:shadow-md">
      <CardContent className="p-4 flex items-start justify-between">
        <div className="flex gap-3">
          <div className="mt-0.5">
            <Badge className={`text-[10px] ${typeColors[e?.type ?? 'personal'] ?? typeColors.personal}`}>{e?.type ?? 'event'}</Badge>
          </div>
          <div>
            <p className="text-sm font-medium flex items-center gap-1.5">
              {e.source === 'birthday' && <Cake className="h-3.5 w-3.5 text-amber-400" />}
              {e?.title ?? 'Untitled'}
              {e.derived && e.source === 'annual' && <Badge variant="outline" className="text-[9px]">annual</Badge>}
            </p>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
              {!e?.allDay && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <SafeTime date={e?.startDatetime} options={{ hour: '2-digit', minute: '2-digit' }} />
                  {e?.endDatetime && <> – <SafeTime date={e.endDatetime} options={{ hour: '2-digit', minute: '2-digit' }} /></>}
                </span>
              )}
              {e?.allDay && <span>All day</span>}
              {e?.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {e.location}</span>}
              {e?.isOnline && <span className="flex items-center gap-1"><Video className="h-3 w-3" /> Online</span>}
            </div>
            {(e?.tags ?? []).length > 0 && (
              <div className="flex items-center gap-1 flex-wrap mt-1">
                {(e.tags as string[]).map((tg) => <Badge key={tg} variant="outline" className="text-[10px]">{tg}</Badge>)}
              </div>
            )}
            {e?.notes && <p className="text-xs text-muted-foreground mt-1">{e.notes}</p>}
            {!e.derived && (
              e.travelBlock?.isPrivate
                ? <Badge variant="outline" className="mt-2 text-[10px]">Private travel block · {e.travelBlock.travelMinutes} min</Badge>
                : <p className="mt-2 text-xs text-muted-foreground">No private travel block</p>
            )}
            {!e.derived && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => onCalendarAction(e.id, 'retry', {}, 'Event sync queued')}>Retry sync</Button>
                <Button size="sm" variant="outline" disabled={!e.location || e.isOnline} onClick={() => onCalendarAction(e.id, 'travel-block', { enabled: true, travelMinutes: e.travelMinutesBefore ?? 30, travelMode: e.travelMode ?? null }, 'Private travel block saved')}>Add travel block</Button>
                <div className="flex gap-1">
                  <Input aria-label="Person ID to invite" className="h-8 w-36 text-xs" value={personId} onChange={(event) => setPersonId(event.target.value)} placeholder="Person ID" />
                  <Button size="sm" variant="outline" disabled={!personId} onClick={() => onCalendarAction(e.id, 'invitees', { personId, decision: 'manually_added' }, 'Invitee saved')}>Invite</Button>
                  <Button size="sm" variant="outline" disabled={!personId} onClick={() => onCalendarAction(e.id, 'invitees', { personId, decision: 'manually_removed' }, 'Invitee removed')}>Remove</Button>
                  <Button size="sm" variant="outline" disabled={!personId} onClick={() => onCalendarAction(e.id, 'invitees', { personId, decision: 'blocked' }, 'Invitee blocked')}>Block</Button>
                </div>
                {e.type === 'medical' && (
                  <div className="w-full rounded-md border border-border p-3 space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <Input aria-label="Destination calendar ID" className="h-8 min-w-48 flex-1 text-xs" value={destinationCalendarId} onChange={(event) => { setDestinationCalendarId(event.target.value); setMedicalPreview(null) }} placeholder="Destination calendar ID" />
                      <Button size="sm" variant="outline" disabled={!destinationCalendarId || medicalBusy} onClick={() => medicalRequest(false)}>Preview forwarding</Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={fullMedicalDetails} onCheckedChange={(checked) => { setFullMedicalDetails(checked); setMedicalPreview(null) }} />
                      <Label className="text-xs">Include full medical details</Label>
                    </div>
                    {medicalPreview?.preview && (
                      <div className="rounded-md bg-muted/50 p-3 space-y-2 text-xs">
                        <p className="font-medium">Exact payload to be sent</p>
                        <dl className="grid grid-cols-[6rem_1fr] gap-x-2 gap-y-1 break-words">
                          <dt className="text-muted-foreground">Title</dt><dd>{medicalPreview.preview.title}</dd>
                          <dt className="text-muted-foreground">Starts</dt><dd><SafeDate date={medicalPreview.preview.startDatetime} options={{ dateStyle: 'medium', timeStyle: 'short' }} locale="en-AU" localize /></dd>
                          <dt className="text-muted-foreground">Ends</dt><dd>{medicalPreview.preview.endDatetime ? <SafeDate date={medicalPreview.preview.endDatetime} options={{ dateStyle: 'medium', timeStyle: 'short' }} locale="en-AU" localize /> : '—'}</dd>
                          <dt className="text-muted-foreground">Location</dt><dd>{medicalPreview.preview.location ?? 'Not shared'}</dd>
                          <dt className="text-muted-foreground">Notes</dt><dd>{medicalPreview.preview.notes ?? 'Not shared'}</dd>
                          <dt className="text-muted-foreground">Attendees</dt><dd>{medicalPreview.preview.attendees.length ? medicalPreview.preview.attendees.join(', ') : 'None'}</dd>
                          <dt className="text-muted-foreground">Visibility</dt><dd>{medicalPreview.preview.visibility}</dd>
                        </dl>
                        <Button size="sm" disabled={medicalBusy} onClick={() => medicalRequest(true)}>Confirm this exact payload</Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        {e.source !== 'birthday' && (
          <Button variant="ghost" size="icon-sm" onClick={() => onDelete(e)} className="text-muted-foreground hover:text-destructive shrink-0">
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
