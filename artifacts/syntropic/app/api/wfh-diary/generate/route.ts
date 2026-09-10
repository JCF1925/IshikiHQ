export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

// POST { startDate, endDate, patternId?, commit } — preview or create WfhDiaryEntry rows
// for each day in range that matches an active WFH pattern's weekdays, excluding leave
// periods, public holidays, and dates that already have a diary entry.
// When commit is false (default) it returns the candidate dates without saving.
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const body = await request.json()

  if (!body.startDate || !body.endDate) {
    return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 })
  }
  const rangeStart = new Date(body.startDate)
  const rangeEnd = new Date(body.endDate)
  if (rangeEnd < rangeStart) return NextResponse.json({ error: 'endDate must be after startDate' }, { status: 400 })

  const [patterns, leave, holidays, existing] = await Promise.all([
    prisma.wfhPattern.findMany({ where: { userId, isActive: true } }),
    prisma.leaveEntry.findMany({ where: { userId } }),
    prisma.publicHoliday.findMany({ where: { userId } }),
    prisma.wfhDiaryEntry.findMany({
      where: { userId, date: { gte: rangeStart, lte: rangeEnd } },
      select: { date: true },
    }),
  ])

  const activePatterns = body.patternId ? patterns.filter((p) => p.id === body.patternId) : patterns
  if (activePatterns.length === 0) return NextResponse.json({ error: 'No active WFH pattern', candidates: [], created: 0 }, { status: 400 })

  const dayKey = (d: Date) => d.toISOString().slice(0, 10)
  const existingKeys = new Set(existing.map((e) => dayKey(new Date(e.date))))
  const holidayKeys = new Set(holidays.map((h) => dayKey(new Date(h.date))))

  const isOnLeave = (d: Date) =>
    leave.some((l) => {
      const s = new Date(l.startDate); s.setHours(0, 0, 0, 0)
      const e = new Date(l.endDate); e.setHours(23, 59, 59, 999)
      return d >= s && d <= e
    })

  const candidates: { date: string; hours: number }[] = []
  const cur = new Date(rangeStart)
  cur.setHours(0, 0, 0, 0)
  const stop = new Date(rangeEnd)
  stop.setHours(0, 0, 0, 0)
  while (cur <= stop) {
    const dow = cur.getDay() // 0=Sun..6=Sat
    const key = dayKey(cur)
    const pat = activePatterns.find((p) => {
      const ps = new Date(p.startDate); ps.setHours(0, 0, 0, 0)
      const pe = p.endDate ? new Date(p.endDate) : null
      if (pe) pe.setHours(23, 59, 59, 999)
      return cur >= ps && (!pe || cur <= pe) && p.dayOfWeek.includes(dow)
    })
    if (pat && !existingKeys.has(key) && !holidayKeys.has(key) && !isOnLeave(cur)) {
      candidates.push({ date: key, hours: pat.hours })
    }
    cur.setDate(cur.getDate() + 1)
  }

  if (!body.commit) {
    return NextResponse.json({ candidates, created: 0, committed: false })
  }

  if (candidates.length > 0) {
    await prisma.wfhDiaryEntry.createMany({
      data: candidates.map((c) => ({
        userId,
        date: new Date(c.date),
        hours: c.hours,
        notes: 'Auto-generated from WFH pattern',
      })),
    })
  }

  return NextResponse.json({ candidates, created: candidates.length, committed: true }, { status: 201 })
}
