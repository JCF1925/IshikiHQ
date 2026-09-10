import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/db.ts'

/*
 * Database acceptance coverage. Run only against the disposable schema created
 * by scripts/clean-database-acceptance.sh:
 * PRICE_WATCH_DATABASE_TESTS=1 pnpm exec tsx --test --experimental-test-module-mocks tests/price-watch-database.test.ts
 */
const databaseTestsEnabled = process.env.PRICE_WATCH_DATABASE_TESTS === '1'
const routeSession = { userId: '' }

mock.module('@/auth', {
  namedExports: {
    auth: async () => routeSession.userId
      ? { user: { id: routeSession.userId } }
      : null,
  },
})
mock.module('@/lib/db', { namedExports: { prisma } })

const jsonRequest = (url: string, method: string, body?: unknown) => new Request(url, {
  method,
  headers: { 'content-type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
})

const watchPayload = (productName: string) => ({
  productName,
  packQuantity: 750,
  packUnit: 'g',
  preferredRetailers: ['Private retailer'],
  targetPrice: 5,
  checkCadence: 'weekly',
  status: 'active',
})

const observationPayload = (price: number) => ({
  price,
  packQuantity: 750,
  packUnit: 'g',
  shippingCost: 1,
  observedAt: '2026-09-10T12:00:00.000Z',
  sourceUrl: 'https://example.test/price',
  notes: 'Private price observation',
})

describe('price-watch database privacy acceptance', { skip: !databaseTestsEnabled }, () => {
  it('keeps watches and observations private between two isolated users', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const ownerAId = `price-watch-owner-a-${suffix}`
    const ownerBId = `price-watch-owner-b-${suffix}`
    const privateA = `price-watch-private-a-${suffix}`
    const privateB = `price-watch-private-b-${suffix}`

    const ownerA = await prisma.user.create({
      data: { id: ownerAId, email: `${ownerAId}@example.test`, name: 'Price watch owner A' },
    })
    const ownerB = await prisma.user.create({
      data: { id: ownerBId, email: `${ownerBId}@example.test`, name: 'Price watch owner B' },
    })

    try {
      const { GET: listWatches, POST: createWatch } = await import('../app/api/price-watches/route.ts')
      const {
        GET: listObservations,
        POST: createObservation,
      } = await import('../app/api/price-watches/[id]/observations/route.ts')
      const { PATCH: updateWatch, DELETE: deleteWatch } = await import('../app/api/price-watches/[id]/route.ts')
      const {
        PATCH: updateObservation,
        DELETE: deleteObservation,
      } = await import('../app/api/price-watches/[id]/observations/[observationId]/route.ts')

      routeSession.userId = ownerA.id
      const createWatchAResponse = await createWatch(
        jsonRequest('http://localhost/api/price-watches', 'POST', watchPayload(privateA)),
      )
      assert.equal(createWatchAResponse.status, 201)
      const watchA = await createWatchAResponse.json() as { id: string; userId: string }
      assert.equal(watchA.userId, ownerA.id)

      const createObservationAResponse = await createObservation(
        jsonRequest('http://localhost/api/price-watches/a/observations', 'POST', observationPayload(4.5)),
        { params: Promise.resolve({ id: watchA.id }) },
      )
      assert.equal(createObservationAResponse.status, 201)
      const observationA = await createObservationAResponse.json() as { id: string; userId: string; watchId: string }
      assert.equal(observationA.userId, ownerA.id)
      assert.equal(observationA.watchId, watchA.id)

      routeSession.userId = ownerB.id
      const createWatchBResponse = await createWatch(
        jsonRequest('http://localhost/api/price-watches', 'POST', watchPayload(privateB)),
      )
      assert.equal(createWatchBResponse.status, 201)
      const watchB = await createWatchBResponse.json() as { id: string; userId: string }
      assert.equal(watchB.userId, ownerB.id)

      const createObservationBResponse = await createObservation(
        jsonRequest('http://localhost/api/price-watches/b/observations', 'POST', observationPayload(6.5)),
        { params: Promise.resolve({ id: watchB.id }) },
      )
      assert.equal(createObservationBResponse.status, 201)
      const observationB = await createObservationBResponse.json() as { id: string; userId: string; watchId: string }
      assert.equal(observationB.userId, ownerB.id)
      assert.equal(observationB.watchId, watchB.id)

      const ownerBWatchList = await listWatches()
      assert.equal(ownerBWatchList.status, 200)
      const ownerBWatches = await ownerBWatchList.json() as Array<{
        id: string
        productName: string
        observations: Array<{ id: string }>
      }>
      assert.deepEqual(ownerBWatches.map(({ id, productName, observations }) => ({
        id,
        productName,
        observations: observations.map(({ id: observationId }) => observationId),
      })), [{
        id: watchB.id,
        productName: privateB,
        observations: [observationB.id],
      }])
      assert.doesNotMatch(JSON.stringify(ownerBWatches), new RegExp(privateA))
      assert.doesNotMatch(JSON.stringify(ownerBWatches), new RegExp(observationA.id))

      routeSession.userId = ownerA.id
      const ownerAWatchList = await listWatches()
      assert.equal(ownerAWatchList.status, 200)
      const ownerAWatches = await ownerAWatchList.json() as Array<{
        id: string
        productName: string
        observations: Array<{ id: string }>
      }>
      assert.deepEqual(ownerAWatches.map(({ id, productName, observations }) => ({
        id,
        productName,
        observations: observations.map(({ id: observationId }) => observationId),
      })), [{
        id: watchA.id,
        productName: privateA,
        observations: [observationA.id],
      }])
      assert.doesNotMatch(JSON.stringify(ownerAWatches), new RegExp(privateB))
      assert.doesNotMatch(JSON.stringify(ownerAWatches), new RegExp(observationB.id))

      routeSession.userId = ownerB.id
      assert.equal(
        (await listObservations(new Request('http://localhost'), { params: Promise.resolve({ id: watchA.id }) })).status,
        404,
      )
      assert.equal(
        (await createObservation(
          jsonRequest('http://localhost/api/price-watches/a/observations', 'POST', observationPayload(7)),
          { params: Promise.resolve({ id: watchA.id }) },
        )).status,
        404,
      )
      assert.equal(
        (await updateWatch(
          jsonRequest('http://localhost/api/price-watches/a', 'PATCH', { productName: 'Should not change' }),
          { params: Promise.resolve({ id: watchA.id }) },
        )).status,
        404,
      )
      assert.equal(
        (await deleteWatch(new Request('http://localhost/api/price-watches/a', { method: 'DELETE' }), {
          params: Promise.resolve({ id: watchA.id }),
        })).status,
        404,
      )
      assert.equal(
        (await updateObservation(
          jsonRequest('http://localhost/api/price-watches/a/observations/a', 'PATCH', { notes: 'Should not change' }),
          { params: Promise.resolve({ id: watchA.id, observationId: observationA.id }) },
        )).status,
        404,
      )
      assert.equal(
        (await deleteObservation(new Request('http://localhost/api/price-watches/a/observations/a', { method: 'DELETE' }), {
          params: Promise.resolve({ id: watchA.id, observationId: observationA.id }),
        })).status,
        404,
      )

      const unchangedA = await prisma.priceWatch.findUnique({
        where: { id: watchA.id },
        include: { observations: true },
      })
      assert.equal(unchangedA?.productName, privateA)
      assert.equal(unchangedA?.observations.length, 1)
      assert.equal(unchangedA?.observations[0]?.notes, 'Private price observation')

      await assert.rejects(
        prisma.priceObservation.create({
          data: {
            id: `price-watch-mismatched-observation-${suffix}`,
            userId: ownerB.id,
            watchId: watchA.id,
            price: 3,
            packQuantity: 750,
            packUnit: 'g',
            observedAt: new Date('2026-09-10T12:00:00.000Z'),
          },
        }),
        (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003',
        'the database must reject an observation whose owner differs from its watch owner',
      )
    } finally {
      routeSession.userId = ''
      await prisma.user.deleteMany({ where: { id: { in: [ownerA.id, ownerB.id] } } })
    }
  })
})