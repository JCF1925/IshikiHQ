export const dynamic = 'force-dynamic'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { apiError, apiSuccess, parseBody } from '@/lib/api'
import { executeInvitationNotifications } from '@/lib/calendar-invitations'
import { enqueueCalendarSync } from '@/lib/calendar-server'
import { z } from 'zod'

const schema = z.object({
  personId: z.string().cuid(),
  decision: z.enum(['manually_added', 'manually_removed', 'blocked']),
  reason: z.string().trim().max(1000).nullable().optional(),
})

type PublicInviteDecision = {
  id: string
  eventId: string
  personId: string
  decision: string
  reason: string | null
  invitationStatus: string
}

const publicInviteDecision = (decision: {
  id: string
  eventId: string
  personId: string
  decision: string
  reason: string | null
  invitationStatus: string
}): PublicInviteDecision => ({
  id: decision.id,
  eventId: decision.eventId,
  personId: decision.personId,
  decision: decision.decision,
  reason: decision.reason,
  invitationStatus: decision.invitationStatus,
})

const publicNotificationStatus = (notification: { queued: number }) => ({
  queued: notification.queued,
})

const publicSyncStatus = (sync: { queued: boolean }) => ({
  queued: sync.queued,
})

export async function POST(r: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await auth()
  if (!s?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const { id } = await params
  const p = await parseBody(r, schema)
  if (!p.success) return p.response
  const userId = (s.user as any).id
  const [event, person, prior] = await Promise.all([
    prisma.event.findFirst({ where: { id, userId } }),
    prisma.person.findFirst({ where: { id: p.data.personId, userId } }),
    prisma.eventInviteDecision.findUnique({ where: { eventId_personId: { eventId: id, personId: p.data.personId } } }),
  ])
  if (!event) return apiError('NOT_FOUND', 'Event not found', 404)
  if (!person) return apiError('NOT_FOUND', 'Person not found', 404)
  if (p.data.decision === 'manually_added' && (!person.email || !z.string().email().safeParse(person.email).success)) {
    return apiError('VALIDATION_ERROR', 'The invitee must have a valid email address', 400)
  }
  const reason = p.data.reason ?? null
  if (prior?.decision === p.data.decision && prior.reason === reason) {
    return apiSuccess({
      decision: publicInviteDecision(prior),
      unchanged: true,
    })
  }

  const result = await prisma.$transaction(async tx => {
    const nextEvent = await tx.event.update({ where: { id }, data: { syncVersion: { increment: 1 }, syncStatus: 'pending', syncError: null } })
    const decision = await tx.eventInviteDecision.upsert({
      where: { eventId_personId: { eventId: id, personId: p.data.personId } },
      create: {
        eventId: id,
        personId: p.data.personId,
        decision: p.data.decision,
        reason,
        invitationStatus: p.data.decision === 'blocked' ? 'blocked' : 'pending',
      },
      update: {
        ruleId: null,
        decision: p.data.decision,
        reason,
        invitationStatus: p.data.decision === 'blocked' ? 'blocked' : 'pending',
      },
    })
    return { nextEvent, decision }
  })
  const action = p.data.decision === 'manually_added' ? 'sent' : 'cancelled'
  const notification = await executeInvitationNotifications(userId, id, result.nextEvent.syncVersion, action, [p.data.personId])
  const sync = await enqueueCalendarSync(userId, id, 'update').catch(() => ({ queued: false }))
  return apiSuccess({
    decision: publicInviteDecision(await prisma.eventInviteDecision.findUnique({ where: { id: result.decision.id } }) as PublicInviteDecision),
    notification: publicNotificationStatus(notification),
    sync: publicSyncStatus(sync),
  })
}