import type { Prisma } from '@prisma/client'

/**
 * Events currently own one provider event ID/etag, so a user may have only one
 * enabled Google destination across every connection. Switching targets clears
 * old mappings before the new target is queued, ensuring old IDs are never sent
 * to another account or calendar.
 */
export async function prepareExclusiveCalendarTarget(
  tx: Prisma.TransactionClient,
  input: { connectionId: string; userId: string; externalCalendarId: string },
) {
  // Serialize all target activations for this owner. Without the row lock, two
  // concurrent confirmations on different connections could both observe no
  // enabled predecessor and violate the singleton Event mapping invariant.
  await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "User" WHERE "id" = ${input.userId} FOR UPDATE
  `
  const previousTargets = await tx.calendarSyncSetting.findMany({
    where: {
      enabled: true,
      connection: { userId: input.userId, provider: 'google' },
      NOT: {
        connectionId: input.connectionId,
        externalCalendarId: input.externalCalendarId,
      },
    },
    select: { id: true, connectionId: true, externalCalendarId: true },
  })
  const previousCalendarIds = [...new Set(previousTargets.map(target => target.externalCalendarId))]
  if (!previousTargets.length) return { previousCalendarIds, resetEvents: 0 }

  await tx.calendarSyncSetting.updateMany({
    where: { id: { in: previousTargets.map(target => target.id) } },
    data: { enabled: false },
  })
  await tx.calendarSyncJob.updateMany({
    where: {
      OR: previousTargets.map(target => ({
        connectionId: target.connectionId,
        externalCalendarId: target.externalCalendarId,
      })),
      status: { in: ['queued', 'failed', 'running'] },
    },
    data: {
      status: 'cancelled',
      completedAt: new Date(),
      error: 'Calendar target changed before this job ran',
    },
  })
  const reset = await tx.event.updateMany({
    where: {
      userId: input.userId,
      externalProvider: 'google',
      externalCalendarId: { in: previousCalendarIds },
    },
    data: {
      externalProvider: null,
      externalCalendarId: null,
      externalEventId: null,
      externalEtag: null,
      syncStatus: 'pending',
      syncError: null,
      lastSyncedAt: null,
    },
  })
  return { previousCalendarIds, resetEvents: reset.count }
}