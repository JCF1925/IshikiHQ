import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { prisma as databasePrisma } from '../lib/db.ts'

const databaseTestsEnabled = process.env.CALENDAR_EVENT_LIFECYCLE_DATABASE_TESTS === '1'
let sessionUserId = 'calendar-lifecycle-owner'

const auth = async () => ({ user: { id: sessionUserId } })
mock.module('@/auth', { namedExports: { auth } })
mock.module('@/lib/db', { namedExports: { prisma: databasePrisma } })
mock.module('@/lib/calendar-invitations', {
  namedExports: { executeInvitationNotifications: async () => ({ queued: 0 }) },
})
mock.module('@/lib/calendar-server', {
  namedExports: { enqueueCalendarSync: async () => ({ queued: true }) },
})

test('deleting an event removes its private travel block without crossing owners', {
  skip: !databaseTestsEnabled && 'requires a disposable migrated database',
}, async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const ownerId = `calendar-lifecycle-owner-${suffix}`
  const otherId = `calendar-lifecycle-other-${suffix}`
  const startDatetime = new Date('2026-09-08T13:00:00.000Z')
  const endDatetime = new Date('2026-09-08T14:00:00.000Z')
  const createEvent = (userId: string, title: string, externalEventId?: string) =>
    databasePrisma.event.create({
      data: {
        userId,
        title,
        startDatetime,
        endDatetime,
        location: 'Private clinic',
        peopleRefs: [],
        tags: [],
        travelMinutesBefore: 20,
        travelMode: 'driving',
        ...(externalEventId ? { externalEventId } : {}),
      },
    })

  const owner = await databasePrisma.user.create({
    data: { id: ownerId, email: `${ownerId}@example.test`, name: 'Calendar lifecycle owner' },
  })
  const other = await databasePrisma.user.create({
    data: { id: otherId, email: `${otherId}@example.test`, name: 'Calendar lifecycle other' },
  })

  try {
    const ownedEvent = await createEvent(owner.id, 'Owned event')
    const otherEvent = await createEvent(other.id, 'Other user event')
    const providerEvent = await createEvent(owner.id, 'Provider event', `provider-event-${suffix}`)
    await databasePrisma.privateTravelBlock.createMany({
      data: [ownedEvent, otherEvent, providerEvent].map(event => ({
        eventId: event.id,
        startDatetime: new Date(startDatetime.getTime() - 20 * 60 * 1000),
        endDatetime: startDatetime,
        travelMinutes: 20,
        travelMode: 'driving' as const,
        isPrivate: true,
      })),
    })

    const { DELETE, PUT } = await import('../app/api/events/[id]/route.ts')

    sessionUserId = owner.id
    const deleteResponse = await DELETE(new Request('http://localhost', { method: 'DELETE' }), {
      params: Promise.resolve({ id: ownedEvent.id }),
    })
    assert.equal(deleteResponse.status, 200)
    assert.equal(await databasePrisma.event.findUnique({ where: { id: ownedEvent.id } }), null)
    assert.equal(await databasePrisma.privateTravelBlock.findUnique({ where: { eventId: ownedEvent.id } }), null)

    const deleteOtherResponse = await DELETE(new Request('http://localhost', { method: 'DELETE' }), {
      params: Promise.resolve({ id: otherEvent.id }),
    })
    assert.equal(deleteOtherResponse.status, 404)
    assert.notEqual(await databasePrisma.event.findUnique({ where: { id: otherEvent.id } }), null)
    assert.notEqual(await databasePrisma.privateTravelBlock.findUnique({ where: { eventId: otherEvent.id } }), null)

    const updateOtherResponse = await PUT(
      new Request('http://localhost', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Must not change' }),
      }),
      { params: Promise.resolve({ id: otherEvent.id }) },
    )
    assert.equal(updateOtherResponse.status, 404)
    assert.equal((await databasePrisma.event.findUnique({ where: { id: otherEvent.id } }))?.title, 'Other user event')
    assert.notEqual(await databasePrisma.privateTravelBlock.findUnique({ where: { eventId: otherEvent.id } }), null)

    const providerDeleteResponse = await DELETE(new Request('http://localhost', { method: 'DELETE' }), {
      params: Promise.resolve({ id: providerEvent.id }),
    })
    assert.equal(providerDeleteResponse.status, 200)
    assert.equal((await databasePrisma.event.findUnique({ where: { id: providerEvent.id } }))?.isCancelled, true)
    assert.equal(await databasePrisma.privateTravelBlock.findUnique({ where: { eventId: providerEvent.id } }), null)
  } finally {
    await databasePrisma.user.delete({ where: { id: owner.id } })
    await databasePrisma.user.delete({ where: { id: other.id } })
  }
})