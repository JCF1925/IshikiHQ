export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

// Derived annual events: birthdays from People + any Event flagged as an annual recurrence.
// Projected across the current year and the next year (1-Jan rollover behaviour).
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id

  const url = new URL(request.url)
  const baseYear = parseInt(url.searchParams.get('year') || '') || new Date().getFullYear()
  const years = [baseYear, baseYear + 1]

  const [people, annualEvents] = await Promise.all([
    prisma.person.findMany({ where: { userId, birthday: { not: null } }, select: { id: true, name: true, birthday: true } }),
    prisma.event.findMany({ where: { userId, recurrenceRule: { in: ['annual', 'yearly', 'FREQ=YEARLY'] } } }),
  ])

  const derived: any[] = []

  for (const p of people) {
    if (!p.birthday) continue
    const bd = new Date(p.birthday)
    const month = bd.getUTCMonth()
    const day = bd.getUTCDate()
    const birthYear = bd.getUTCFullYear()
    for (const y of years) {
      const start = new Date(Date.UTC(y, month, day, 0, 0, 0))
      const turning = birthYear > 1900 ? y - birthYear : null
      derived.push({
        id: `birthday:${p.id}:${y}`,
        title: turning ? `${p.name}'s birthday (${turning})` : `${p.name}'s birthday`,
        type: 'reminder',
        startDatetime: start.toISOString(),
        endDatetime: null,
        allDay: true,
        isOnline: false,
        location: null,
        notes: null,
        tags: ['birthday'],
        peopleRefs: [p.id],
        derived: true,
        source: 'birthday',
      })
    }
  }

  for (const e of annualEvents) {
    const ed = new Date(e.startDatetime)
    const month = ed.getUTCMonth()
    const day = ed.getUTCDate()
    const hours = ed.getUTCHours()
    const mins = ed.getUTCMinutes()
    for (const y of years) {
      const start = new Date(Date.UTC(y, month, day, hours, mins, 0))
      derived.push({
        id: `annual:${e.id}:${y}`,
        title: e.title,
        type: e.type,
        startDatetime: start.toISOString(),
        endDatetime: null,
        allDay: e.allDay,
        isOnline: e.isOnline,
        location: e.location,
        notes: e.notes,
        tags: e.tags,
        peopleRefs: e.peopleRefs,
        derived: true,
        source: 'annual',
        sourceId: e.id,
      })
    }
  }

  derived.sort((a, b) => a.startDatetime.localeCompare(b.startDatetime))
  return NextResponse.json(derived)
}
