export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { apiError, apiSuccess, parseBody } from '@/lib/api'
import { eventUpdateSchema } from '@/lib/validation'
import { enqueueCalendarSync } from '@/lib/calendar-server'
import { materialGuestUpdate, type CalendarEvent } from '@/lib/calendar-core'
import { executeInvitationNotifications } from '@/lib/calendar-invitations'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params
  const parsed = await parseBody(req, eventUpdateSchema)
  if (!parsed.success) return parsed.response
  const body = parsed.data

  const existing = await prisma.event.findFirst({ where: { id, userId } })
  if (!existing) return apiError('NOT_FOUND', 'Event not found', 404)
  const data: any = {}
  if (body.title !== undefined) data.title = body.title
  if (body.type !== undefined) data.type = body.type
  if (body.startDatetime !== undefined) data.startDatetime = new Date(body.startDatetime)
  if (body.endDatetime !== undefined) data.endDatetime = body.endDatetime ? new Date(body.endDatetime) : null
  if (body.location !== undefined) data.location = body.location
  if (body.isOnline !== undefined) data.isOnline = body.isOnline
  if (body.allDay !== undefined) data.allDay = body.allDay
  if (body.notes !== undefined) data.notes = body.notes
  if (body.tags !== undefined) data.tags = body.tags
  if (body.recurrenceRule !== undefined) data.recurrenceRule = body.recurrenceRule || null
  if (body.peopleRefs !== undefined) data.peopleRefs = body.peopleRefs
  if (body.onlineUrl !== undefined) data.onlineUrl = body.onlineUrl
  if (body.travelMinutesBefore !== undefined) data.travelMinutesBefore = body.travelMinutesBefore
  if (body.linkedCostSourceType !== undefined) data.linkedCostSourceType = body.linkedCostSourceType
  if (body.linkedCostSourceId !== undefined) data.linkedCostSourceId = body.linkedCostSourceId
  if (body.linkedCostAmount !== undefined) data.linkedCostAmount = body.linkedCostAmount
  if (body.costOverrideAmount !== undefined) data.costOverrideAmount = body.costOverrideAmount

  const next = await prisma.event.update({ where: { id }, data: { ...data, syncVersion: { increment: 1 }, syncStatus: 'pending', syncError: null } })
  const guestChanged = materialGuestUpdate(existing as CalendarEvent, next as CalendarEvent)
  if (guestChanged) await executeInvitationNotifications(userId, id, next.syncVersion, 'updated')
  const sync = await enqueueCalendarSync(userId, id, 'update').catch(() => ({ queued: false }))
  return apiSuccess({ ...next, sync })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params

  const event = await prisma.event.findFirst({ where: { id, userId } })
  if (!event) return apiError('NOT_FOUND', 'Event not found', 404)
  // Preserve a local cancellation while provider-linked deletion can be synced.
  if (event.externalEventId) {
    const cancelled = await prisma.event.update({ where: { id }, data: { isCancelled: true, syncStatus: 'pending', syncVersion: { increment: 1 } } })
    await executeInvitationNotifications(userId, id, cancelled.syncVersion, 'cancelled')
    await enqueueCalendarSync(userId, id, 'delete').catch(() => undefined)
  } else {
    await executeInvitationNotifications(userId, id, event.syncVersion, 'cancelled')
    await prisma.event.delete({ where: { id } })
  }
  return NextResponse.json({ success: true })
}
