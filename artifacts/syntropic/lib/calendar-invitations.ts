import { prisma } from '@/lib/db'
import { invitationNotificationKey } from '@/lib/calendar-core'

type NotificationAction = 'sent' | 'updated' | 'cancelled'

/**
 * Marks invitation work as pending. Delivery is completed only after the
 * Calendar provider accepts the event attendee mutation.
 */
export async function executeInvitationNotifications(
  userId: string,
  eventId: string,
  version: number,
  action: NotificationAction,
  personIds?: readonly string[],
) {
  const decisions = await prisma.eventInviteDecision.findMany({
    where: {
      eventId,
      ...(personIds ? { personId: { in: [...personIds] } } : {}),
      decision: { in: action === 'cancelled' ? ['rule_selected', 'manually_added', 'manually_removed', 'blocked'] : ['rule_selected', 'manually_added'] },
      ...(action === 'cancelled' ? {} : { invitationStatus: { not: 'blocked' as const } }),
    },
  })
  for (const decision of decisions) {
    const cancellationNeedsDelivery = action === 'cancelled' && decision.lastNotifiedVersion != null
    await prisma.eventInviteDecision.update({
      where: { id: decision.id },
      data: {
        invitationStatus: action === 'cancelled' && !cancellationNeedsDelivery
          ? decision.decision === 'blocked' ? 'blocked' : 'cancelled'
          : 'pending',
      },
    })
  }
  return { queued: decisions.length, considered: decisions.length }
}

/** Records provider-confirmed guest delivery exactly once per event version. */
export async function completeInvitationNotifications(
  userId: string,
  eventId: string,
  version: number,
  action: NotificationAction,
  personIds: readonly string[],
) {
  const decisions = await prisma.eventInviteDecision.findMany({
    where: { eventId, personId: { in: [...personIds] } },
  })
  let executed = 0
  for (const decision of decisions) {
    const key = invitationNotificationKey(eventId, decision.personId, version, action)
    try {
      await prisma.$transaction(async (tx) => {
        await tx.calendarIdempotencyKey.create({
          data: {
            userId,
            operation: `invitation:${action}`,
            key,
            resourceType: 'event_invite_decision',
            resourceId: decision.id,
            result: { eventId, personId: decision.personId, version, deliveredBy: 'calendar_provider' },
          },
        })
        await tx.eventInviteDecision.update({
          where: { id: decision.id },
          data: {
            invitationStatus: action === 'cancelled'
              ? decision.decision === 'blocked' ? 'blocked' : 'cancelled'
              : action === 'sent' ? 'sent' : 'updated',
            lastNotifiedVersion: version,
          },
        })
        await tx.calendarAuditRecord.create({
          data: {
            userId,
            eventId,
            action: action === 'cancelled' ? 'invitation_cancelled' : action === 'sent' ? 'invitation_sent' : 'invitation_updated',
            idempotencyKey: key,
            metadata: { personId: decision.personId, version, deliveredBy: 'calendar_provider' },
          },
        })
      })
      executed++
    } catch (error: any) {
      if (error?.code !== 'P2002') throw error
    }
  }
  return { executed, considered: decisions.length }
}