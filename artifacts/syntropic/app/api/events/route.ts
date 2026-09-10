export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { apiSuccess, parseBody } from '@/lib/api'
import { eventCreateSchema } from '@/lib/validation'
import { enqueueCalendarSync } from '@/lib/calendar-server'
import { matchesInviteRule, selectedInviteesForEvent, type CalendarEvent, type InviteRule } from '@/lib/calendar-core'
import { executeInvitationNotifications } from '@/lib/calendar-invitations'

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const url = new URL(request.url)
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const type = url.searchParams.get('type')
  const tag = url.searchParams.get('tag')

  const where: any = { userId }
  if (type) where.type = type
  if (tag) where.tags = { has: tag }
  if (from || to) {
    where.startDatetime = {}
    if (from) where.startDatetime.gte = new Date(from)
    if (to) where.startDatetime.lte = new Date(to)
  }

  const events = await prisma.event.findMany({
    where,
    orderBy: { startDatetime: 'asc' },
  })
  return NextResponse.json(events)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const parsed = await parseBody(request, eventCreateSchema)
  if (!parsed.success) return parsed.response
  const body = parsed.data

  const rules = await prisma.calendarInviteRule.findMany({
    where: { userId, enabled: true },
    orderBy: { createdAt: 'asc' },
  })
  const eventData = {
      userId,
      title: body.title,
      type: body.type ?? 'personal',
      startDatetime: new Date(body.startDatetime),
      endDatetime: body.endDatetime ? new Date(body.endDatetime) : null,
      location: body.location ?? null,
      isOnline: body.isOnline ?? false,
      allDay: body.allDay ?? false,
      recurrenceRule: body.recurrenceRule ?? null,
      notes: body.notes ?? null,
      peopleRefs: body.peopleRefs ?? [],
      tags: body.tags ?? [],
      onlineUrl: body.onlineUrl ?? null,
      travelMinutesBefore: body.travelMinutesBefore ?? null,
      linkedCostSourceType: body.linkedCostSourceType ?? null,
      linkedCostSourceId: body.linkedCostSourceId ?? null,
      linkedCostAmount: body.linkedCostAmount ?? null,
      costOverrideAmount: body.costOverrideAmount ?? null,
  }
  const candidateEvent = { id: 'preview', ...eventData } as CalendarEvent
  const pendingInviteRules = rules.filter((rule) =>
    !rule.firstMatchConfirmedAt && matchesInviteRule(candidateEvent, rule as InviteRule),
  ).map((rule) => ({ id: rule.id, name: rule.name, inviteePersonIds: rule.inviteePersonIds }))
  const event = await prisma.$transaction(async (tx) => {
    const created = await tx.event.create({ data: eventData })
    const selected = selectedInviteesForEvent(created as CalendarEvent, rules as InviteRule[])
    if (selected.length) await tx.eventInviteDecision.createMany({
      data: selected.map(({ personId, ruleId }) => ({
        eventId: created.id,
        ruleId,
        personId,
        decision: 'rule_selected' as const,
      })),
      skipDuplicates: true,
    })
    return created
  })
  await executeInvitationNotifications(userId, event.id, event.syncVersion, 'sent')
  const sync = await enqueueCalendarSync(userId, event.id, 'create').catch(() => ({ queued: false }))
  return apiSuccess({ ...event, sync, pendingInviteRules }, { status: 201 })
}
