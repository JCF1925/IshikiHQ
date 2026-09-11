/* Database acceptance coverage. Enable only against an isolated disposable DB:
 * PHARMACY_REFILL_DATABASE_TESTS=1 pnpm exec tsx --test --experimental-test-module-mocks tests/pharmacy-refill-db.test.ts */
import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { prisma } from '../lib/db.ts'

const enabled = process.env.PHARMACY_REFILL_DATABASE_TESTS === '1'
const routeSession = { userId: '' }

mock.module('@/auth', {
  namedExports: {
    auth: async () => routeSession.userId
      ? { user: { id: routeSession.userId } }
      : null,
  },
})
mock.module('@/lib/db', { namedExports: { prisma } })

const request = (url: string, body: unknown, method = 'PATCH') => new Request(url, {
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

describe('pharmacy refill database acceptance', { skip: !enabled }, () => {
  it('receives once, keeps the order private, and preserves balances after reload', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const owner = await prisma.user.create({
      data: { email: `refill-owner-${suffix}@example.test`, name: 'Refill acceptance owner' },
    })
    const otherUser = await prisma.user.create({
      data: { email: `refill-other-${suffix}@example.test`, name: 'Refill acceptance other' },
    })
    const medication = await prisma.medication.create({
      data: { userId: owner.id, name: `Refill acceptance medication ${suffix}`, isOtc: false },
    })
    const stock = await prisma.stockLevel.create({
      data: { userId: owner.id, medicationId: medication.id, currentQuantity: 12 },
    })
    const prescription = await prisma.prescription.create({
      data: {
        userId: owner.id,
        medicationId: medication.id,
        datePrescribed: new Date('2026-09-01T00:00:00.000Z'),
        quantity: 30,
        repeats: 1,
        repeatsUsed: 0,
        expiryDate: new Date('2026-12-31T00:00:00.000Z'),
      },
    })
    const pharmacy = await prisma.pharmacy.create({
      data: { userId: owner.id, name: `Refill acceptance pharmacy ${suffix}` },
    })
    const order = await prisma.pharmacyOrder.create({
      data: {
        userId: owner.id,
        pharmacyId: pharmacy.id,
        periodStart: new Date('2026-09-10T00:00:00.000Z'),
        periodEnd: new Date('2026-09-23T00:00:00.000Z'),
        status: 'placed',
        lines: {
          create: {
            medicationId: medication.id,
            prescriptionId: prescription.id,
            quantity: 5,
            status: 'ordered',
          },
        },
      },
      include: { lines: true },
    })
    const line = order.lines[0]
    assert.ok(line)
    routeSession.userId = owner.id

    try {
      const { GET } = await import('../app/api/medication-orders/route.ts')
      const { PATCH } = await import('../app/api/medication-orders/[id]/route.ts')

      const receive = await PATCH(
        request(`http://localhost/api/medication-orders/${order.id}`, { action: 'receive' }),
        { params: Promise.resolve({ id: order.id }) },
      )
      assert.equal(receive.status, 200)

      const receivedOrder = await prisma.pharmacyOrder.findUniqueOrThrow({
        where: { id: order.id },
        include: { lines: true },
      })
      assert.equal(receivedOrder.status, 'received')
      assert.equal(receivedOrder.lines[0]?.status, 'received')
      assert.ok(receivedOrder.lines[0]?.receivedAt)

      const receivedStock = await prisma.stockLevel.findUniqueOrThrow({
        where: { userId_medicationId: { userId: owner.id, medicationId: medication.id } },
      })
      assert.equal(receivedStock.currentQuantity, 17)
      assert.equal(await prisma.stockTransaction.count({
        where: { userId: owner.id, medicationId: medication.id, notes: `Received pharmacy order ${order.id}` },
      }), 1)
      const receivedPrescription = await prisma.prescription.findUniqueOrThrow({ where: { id: prescription.id } })
      assert.equal(receivedPrescription.repeatsUsed, 1)

      const retry = await PATCH(
        request(`http://localhost/api/medication-orders/${order.id}`, { action: 'receive' }),
        { params: Promise.resolve({ id: order.id }) },
      )
      assert.equal(retry.status, 200)
      assert.equal(await prisma.stockTransaction.count({
        where: { userId: owner.id, medicationId: medication.id, notes: `Received pharmacy order ${order.id}` },
      }), 1)
      assert.equal((await prisma.prescription.findUniqueOrThrow({ where: { id: prescription.id } })).repeatsUsed, 1)

      const reloaded = await GET()
      assert.equal(reloaded.status, 200)
      const reloadedData = await reloaded.json() as {
        orders: Array<{
          id: string
          status: string
          lines: Array<{ id: string; status: string; receivedAt: string | null }>
          events: Array<{ fromStatus: string | null; toStatus: string }>
        }>
        forecast: Array<{ medicationId: string; stock: number; availablePrescriptionFills: number }>
      }
      const visibleOrder = reloadedData.orders.find(item => item.id === order.id)
      assert.deepEqual(visibleOrder, {
        id: order.id,
        status: 'received',
        lines: [{
          id: line.id,
          status: 'received',
          receivedAt: receivedOrder.lines[0]!.receivedAt!.toISOString(),
        }],
        events: [{ fromStatus: 'placed', toStatus: 'received' }],
      })
      assert.deepEqual(reloadedData.forecast.find(item => item.medicationId === medication.id), {
        medicationId: medication.id,
        stock: 17,
        availablePrescriptionFills: 1,
      })

      routeSession.userId = otherUser.id
      const otherReload = await GET()
      assert.equal(otherReload.status, 200)
      const otherData = await otherReload.json() as { orders: Array<{ id: string }> }
      assert.deepEqual(otherData.orders, [])

      const forbiddenReceive = await PATCH(
        request(`http://localhost/api/medication-orders/${order.id}`, { action: 'receive' }),
        { params: Promise.resolve({ id: order.id }) },
      )
      assert.equal(forbiddenReceive.status, 404)
      assert.equal(await prisma.stockTransaction.count({
        where: { userId: owner.id, medicationId: medication.id, notes: `Received pharmacy order ${order.id}` },
      }), 1)
    } finally {
      routeSession.userId = ''
      await prisma.pharmacyOrderEvent.deleteMany({ where: { orderId: order.id } })
      await prisma.pharmacyOrderLine.deleteMany({ where: { orderId: order.id } })
      await prisma.pharmacyOrder.delete({ where: { id: order.id } })
      await prisma.stockTransaction.deleteMany({ where: { userId: owner.id, medicationId: medication.id } })
      await prisma.stockLevel.delete({ where: { id: stock.id } })
      await prisma.prescription.delete({ where: { id: prescription.id } })
      await prisma.pharmacy.delete({ where: { id: pharmacy.id } })
      await prisma.medication.delete({ where: { id: medication.id } })
      await prisma.user.deleteMany({ where: { id: { in: [owner.id, otherUser.id] } } })
    }
  })
})