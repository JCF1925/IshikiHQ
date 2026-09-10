export const dynamic = "force-dynamic";
import { prisma } from '@/lib/db'
import { buildIcs, IcsEvent } from '@/lib/ics'

// Public, token-authenticated iCalendar feed. Designed to be subscribed to from
// Google Calendar / Apple Calendar via "Add calendar from URL". No session cookie
// is available on these requests, so the secret token in the path authenticates it.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!token || token.length < 16) return new Response('Not found', { status: 404 })

  const setting = await prisma.userSetting.findFirst({ where: { key: 'calendar_token', value: token } })
  if (!setting) return new Response('Not found', { status: 404 })
  const userId = setting.userId

  const now = new Date()
  const from = new Date(now.getTime() - 60 * 86400000) // 60 days back
  const to = new Date(now.getTime() + 400 * 86400000)  // ~13 months forward

  const stored = await prisma.event.findMany({
    where: { userId, startDatetime: { gte: from, lte: to } },
    orderBy: { startDatetime: 'asc' },
  })

  // Derived annual events: birthdays + annual-recurrence events across this + next year.
  const baseYear = now.getFullYear()
  const years = [baseYear, baseYear + 1]
  const [people, annualEvents] = await Promise.all([
    prisma.person.findMany({ where: { userId, birthday: { not: null } }, select: { id: true, name: true, birthday: true } }),
    prisma.event.findMany({ where: { userId, recurrenceRule: { in: ['annual', 'yearly', 'FREQ=YEARLY'] } } }),
  ])

  const feed: IcsEvent[] = stored.map((e) => ({
    id: e.id,
    title: e.title,
    startDatetime: e.startDatetime,
    endDatetime: e.endDatetime,
    allDay: e.allDay,
    location: e.location,
    notes: e.notes,
    isOnline: e.isOnline,
  }))

  for (const p of people) {
    if (!p.birthday) continue
    const bd = new Date(p.birthday)
    for (const y of years) {
      const start = new Date(Date.UTC(y, bd.getUTCMonth(), bd.getUTCDate(), 0, 0, 0))
      feed.push({ id: `birthday-${p.id}-${y}`, title: `${p.name}'s birthday`, startDatetime: start, allDay: true })
    }
  }
  for (const e of annualEvents) {
    const ed = new Date(e.startDatetime)
    for (const y of years) {
      const start = new Date(Date.UTC(y, ed.getUTCMonth(), ed.getUTCDate(), ed.getUTCHours(), ed.getUTCMinutes(), 0))
      feed.push({ id: `annual-${e.id}-${y}`, title: e.title, startDatetime: start, allDay: e.allDay, location: e.location, notes: e.notes, isOnline: e.isOnline })
    }
  }

  const ics = buildIcs(feed, 'Ishiki')
  return new Response(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="ishiki.ics"',
      'Cache-Control': 'no-cache',
    },
  })
}
