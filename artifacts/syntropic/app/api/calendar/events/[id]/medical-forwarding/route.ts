export const dynamic = 'force-dynamic'

import { createHash } from 'node:crypto'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { apiError, apiSuccess, parseBody } from '@/lib/api'
import { forwardingPreview, stableIdempotencyKey, type CalendarEvent } from '@/lib/calendar-core'
import { enqueueCalendarSync } from '@/lib/calendar-server'
import { z } from 'zod'

const schema = z.object({
  destinationCalendarId: z.string().trim().min(1).max(500),
  connectionId: z.string().cuid().nullable().optional(),
  attendeeEmails: z.array(z.string().email()).max(100).default([]),
  fullDetails: z.boolean().default(false),
  confirm: z.boolean().default(false),
  previewHash: z.string().length(64).optional(),
})

const hashPreview = (preview: unknown) =>
  createHash('sha256').update(JSON.stringify(preview)).digest('hex')

const publicSyncStatus = (sync: { queued: boolean }) => ({
  queued: sync.queued,
})

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const { id } = await params
  const parsed = await parseBody(request, schema)
  if (!parsed.success) return parsed.response

  const userId = (session.user as any).id
  const event = await prisma.event.findFirst({ where: { id, userId } })
  if (!event) return apiError('NOT_FOUND', 'Event not found', 404)

  const forwardedEvent = forwardingPreview(event as CalendarEvent, parsed.data.attendeeEmails ?? [], parsed.data.fullDetails ?? false)
  const confirmationPreview = {
    destinationCalendarId: parsed.data.destinationCalendarId,
    connectionId: parsed.data.connectionId ?? null,
    eventVersion: event.syncVersion + 1,
    event: forwardedEvent,
  }
  const previewHash = hashPreview(confirmationPreview)
  if (!parsed.data.confirm) return apiSuccess({ preview: forwardedEvent, previewHash, requiresExplicitConfirmation: true })
  if (!parsed.data.previewHash || parsed.data.previewHash !== previewHash) {
    return apiError('CONFLICT', 'Forwarding preview changed; review the exact details again before confirming', 409)
  }
  if (event.type === 'medical' && !parsed.data.fullDetails && (!forwardedEvent.redacted || forwardedEvent.attendees.length)) {
    return apiError('FORBIDDEN', 'Medical forwarding must remain redacted without full-detail opt-in', 403)
  }

  const key = stableIdempotencyKey([
    'medical-forwarding',
    id,
    parsed.data.destinationCalendarId,
    String(event.syncVersion),
    previewHash,
  ])
  await prisma.$transaction(async tx => {
    const consent = await tx.eventMedicalForwardingConsent.upsert({
      where: { eventId_destinationCalendarId: { eventId: id, destinationCalendarId: parsed.data.destinationCalendarId } },
      create: {
        userId,
        eventId: id,
        connectionId: parsed.data.connectionId ?? null,
        destinationCalendarId: parsed.data.destinationCalendarId,
        fullDetails: parsed.data.fullDetails,
        preview: confirmationPreview,
      },
      update: {
        connectionId: parsed.data.connectionId ?? null,
        fullDetails: parsed.data.fullDetails,
        preview: confirmationPreview,
        revokedAt: null,
        confirmedAt: new Date(),
      },
    })
    await tx.calendarIdempotencyKey.upsert({
      where: { userId_operation_key: { userId, operation: 'medical-forwarding', key } },
      create: { userId, operation: 'medical-forwarding', key, resourceType: 'event', resourceId: id, result: confirmationPreview },
      update: {},
    })
    const prior = await tx.calendarAuditRecord.findFirst({
      where: { userId, eventId: id, action: 'medical_forwarding_confirmed', idempotencyKey: key },
    })
    if (!prior) await tx.calendarAuditRecord.create({
      data: {
        userId,
        eventId: id,
        action: 'medical_forwarding_confirmed',
        idempotencyKey: key,
        metadata: {
          destinationCalendarId: parsed.data.destinationCalendarId,
          fullDetails: parsed.data.fullDetails,
          preview: confirmationPreview,
        },
      },
    })
    await tx.event.update({
      where: { id },
      data: { syncVersion: { increment: 1 }, syncStatus: 'pending', syncError: null },
    })
    return consent
  })
  const sync = await enqueueCalendarSync(userId, id, 'update').catch(() => ({ queued: false }))
  return apiSuccess({
    confirmed: true,
    eventId: id,
    sync: publicSyncStatus(sync),
  })
}
