/* Database acceptance coverage. Enable only against an isolated disposable DB:
 * INTERPERSONAL_DEBT_DATABASE_TESTS=1 pnpm exec tsx --test --experimental-test-module-mocks tests/interpersonal-debt-db.test.ts */
import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { prisma } from '../lib/db.ts'

const enabled = process.env.INTERPERSONAL_DEBT_DATABASE_TESTS === '1'
const routeSession = { userId: '' }

mock.module('@/auth', {
  namedExports: {
    auth: async () => routeSession.userId
      ? { user: { id: routeSession.userId } }
      : null,
  },
})
mock.module('@/lib/db', { namedExports: { prisma } })

const jsonRequest = (url: string, body: unknown) => new Request(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

describe('interpersonal debt database acceptance', { skip: !enabled }, () => {
  it('keeps debt links private and preserves allocation, source, and interest invariants', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const owner = await prisma.user.create({
      data: { email: `debt-owner-${suffix}@example.test`, name: 'Debt acceptance owner' },
    })
    const otherUser = await prisma.user.create({
      data: { email: `debt-other-${suffix}@example.test`, name: 'Debt acceptance other' },
    })
    const person = await prisma.person.create({
      data: { userId: owner.id, name: `Debt counterparty ${suffix}` },
    })
    const otherPerson = await prisma.person.create({
      data: { userId: otherUser.id, name: `Other counterparty ${suffix}` },
    })
    const household = await prisma.household.create({
      data: {
        name: `Debt acceptance household ${suffix}`,
        createdById: owner.id,
        memberships: {
          create: [
            { userId: owner.id, role: 'owner' },
            { userId: otherUser.id, role: 'member' },
          ],
        },
      },
      include: { memberships: true },
    })
    const ownerMembership = household.memberships.find((membership) => membership.userId === owner.id)
    assert.ok(ownerMembership)

    const transaction = await prisma.transaction.create({
      data: {
        userId: owner.id,
        date: new Date('2026-01-05T00:00:00.000Z'),
        amount: -100,
        merchant: `Debt allocation source ${suffix}`,
        tags: [],
      },
    })
    const householdExpense = await prisma.householdExpense.create({
      data: {
        householdId: household.id,
        createdById: owner.id,
        paidByMembershipId: ownerMembership.id,
        description: `Shared expense ${suffix}`,
        amount: 30,
        incurredAt: new Date('2026-01-10T00:00:00.000Z'),
        allocationMethod: 'equal',
        allocations: {
          create: {
            membershipId: ownerMembership.id,
            value: 1,
            allocatedAmount: 30,
          },
        },
      },
    })
    const householdSettlement = await prisma.householdSettlement.create({
      data: {
        householdId: household.id,
        payerMembershipId: ownerMembership.id,
        payeeMembershipId: household.memberships.find((membership) => membership.userId === otherUser.id)!.id,
        amount: 20,
        settledAt: new Date('2026-01-15T00:00:00.000Z'),
        createdById: owner.id,
      },
    })

    try {
      const { GET: listDebts, POST: createDebt } = await import('../app/api/debts/route.ts')
      const { GET: getDebt } = await import('../app/api/debts/[id]/route.ts')
      const { POST: createMovement } = await import('../app/api/debts/[id]/movements/route.ts')
      const { POST: previewInterest } = await import('../app/api/debts/[id]/interest/preview/route.ts')
      const { POST: confirmInterest } = await import('../app/api/debts/[id]/interest/confirm/route.ts')

      routeSession.userId = owner.id
      const createResponse = await createDebt(jsonRequest('http://localhost/api/debts', {
        personId: person.id,
        direction: 'they_owe_me',
        principalAmount: 100,
        startDate: '2026-01-01T00:00:00.000Z',
        interestAnnualRate: 12,
        interestStartDate: '2026-01-01T00:00:00.000Z',
        householdId: household.id,
        householdMembershipId: ownerMembership.id,
        name: `Debt acceptance agreement ${suffix}`,
      }))
      assert.equal(createResponse.status, 201)
      const agreement = await createResponse.json() as { id: string }

      routeSession.userId = otherUser.id
      assert.equal(
        (await getDebt(new Request(`http://localhost/api/debts/${agreement.id}`), {
          params: Promise.resolve({ id: agreement.id }),
        })).status,
        404,
        'another account cannot load the debt detail',
      )
      assert.equal(
        (await createMovement(
          jsonRequest(`http://localhost/api/debts/${agreement.id}/movements`, {
            type: 'adjustment',
            amount: 1,
            effectiveAt: '2026-02-01T00:00:00.000Z',
            sourceTransactionId: transaction.id,
          }),
          { params: Promise.resolve({ id: agreement.id }) },
        )).status,
        400,
        'another account cannot link a movement to the debt',
      )
      const otherListResponse = await listDebts(new Request('http://localhost/api/debts'))
      assert.equal(otherListResponse.status, 200)
      const otherList = await otherListResponse.json() as { debts: Array<{ id: string }>; people: Array<{ id: string }> }
      assert.deepEqual(otherList.debts, [])
      assert.deepEqual(otherList.people.map(({ id }) => id), [otherPerson.id])

      routeSession.userId = owner.id
      const addExpense = async () => createMovement(
        jsonRequest(`http://localhost/api/debts/${agreement.id}/movements`, {
          amount: 30,
          effectiveAt: '2026-01-10T00:00:00.000Z',
          householdExpenseId: householdExpense.id,
        }),
        { params: Promise.resolve({ id: agreement.id }) },
      )
      assert.equal((await addExpense()).status, 201)
      assert.equal((await addExpense()).status, 400, 'the same household expense cannot be allocated twice')

      const addSettlement = async () => createMovement(
        jsonRequest(`http://localhost/api/debts/${agreement.id}/movements`, {
          amount: 20,
          effectiveAt: '2026-01-15T00:00:00.000Z',
          householdSettlementId: householdSettlement.id,
        }),
        { params: Promise.resolve({ id: agreement.id }) },
      )
      assert.equal((await addSettlement()).status, 201)
      assert.equal((await addSettlement()).status, 400, 'the same household settlement cannot be allocated twice')

      const addAllocatedMovement = (amount: number) => createMovement(
        jsonRequest(`http://localhost/api/debts/${agreement.id}/movements`, {
          type: 'adjustment',
          amount,
          effectiveAt: '2026-01-20T00:00:00.000Z',
          allocations: [{ transactionId: transaction.id, amount }],
        }),
        { params: Promise.resolve({ id: agreement.id }) },
      )
      assert.equal((await addAllocatedMovement(60)).status, 201)
      assert.equal((await addAllocatedMovement(40)).status, 201)
      assert.equal((await addAllocatedMovement(1)).status, 400, 'cumulative allocations cannot exceed the transaction amount')
      assert.equal(
        Number((await prisma.debtMovementAllocation.aggregate({
          where: { transactionId: transaction.id },
          _sum: { amount: true },
        }))._sum.amount),
        100,
      )

      const previewRequest = () => previewInterest(
        jsonRequest(`http://localhost/api/debts/${agreement.id}/interest/preview`, {
          throughDate: '2026-04-01T00:00:00.000Z',
        }),
        { params: Promise.resolve({ id: agreement.id }) },
      )
      const previewResponse = await previewRequest()
      assert.equal(previewResponse.status, 200)
      const preview = await previewResponse.json() as { interest: number; previewToken: string }
      assert.equal(preview.interest, 7.5)

      assert.equal((await createMovement(
        jsonRequest(`http://localhost/api/debts/${agreement.id}/movements`, {
          type: 'adjustment',
          amount: 1,
          effectiveAt: '2026-02-01T00:00:00.000Z',
        }),
        { params: Promise.resolve({ id: agreement.id }) },
      )).status, 201)
      const staleConfirm = await confirmInterest(
        jsonRequest(`http://localhost/api/debts/${agreement.id}/interest/confirm`, {
          previewToken: preview.previewToken,
        }),
        { params: Promise.resolve({ id: agreement.id }) },
      )
      assert.equal(staleConfirm.status, 409)
      assert.match((await staleConfirm.json()).error, /stale/i)

      const freshPreviewResponse = await previewRequest()
      assert.equal(freshPreviewResponse.status, 200)
      const freshPreview = await freshPreviewResponse.json() as { interest: number; previewToken: string }
      assert.equal(freshPreview.interest, 7.53)
      const confirmedResponse = await confirmInterest(
        jsonRequest(`http://localhost/api/debts/${agreement.id}/interest/confirm`, {
          previewToken: freshPreview.previewToken,
        }),
        { params: Promise.resolve({ id: agreement.id }) },
      )
      assert.equal(confirmedResponse.status, 201)

      const confirmedAgain = await confirmInterest(
        jsonRequest(`http://localhost/api/debts/${agreement.id}/interest/confirm`, {
          previewToken: freshPreview.previewToken,
        }),
        { params: Promise.resolve({ id: agreement.id }) },
      )
      assert.equal(confirmedAgain.status, 409)
      const confirmedMovements = await prisma.debtMovement.findMany({
        where: { agreementId: agreement.id, type: 'confirmed_interest' },
      })
      assert.equal(confirmedMovements.length, 1)
      assert.equal(Number(confirmedMovements[0].amount), 7.53)

      const reloaded = await getDebt(new Request(`http://localhost/api/debts/${agreement.id}`), {
        params: Promise.resolve({ id: agreement.id }),
      })
      assert.equal(reloaded.status, 200)
      const detail = await reloaded.json() as {
        balance: number
        movements: Array<{ type: string; amount: number | string }>
      }
      assert.equal(detail.balance, 258.53)
      assert.equal(detail.movements.filter((movement) => movement.type === 'confirmed_interest').length, 1)
      assert.equal(Number(detail.movements.find((movement) => movement.type === 'confirmed_interest')?.amount), 7.53)
    } finally {
      routeSession.userId = ''
      await prisma.debtAgreement.deleteMany({ where: { userId: owner.id } })
      await prisma.householdExpense.deleteMany({ where: { id: householdExpense.id } })
      await prisma.householdSettlement.deleteMany({ where: { id: householdSettlement.id } })
      await prisma.transaction.deleteMany({ where: { id: transaction.id } })
      await prisma.person.deleteMany({ where: { id: { in: [person.id, otherPerson.id] } } })
      await prisma.household.delete({ where: { id: household.id } })
      await prisma.user.deleteMany({ where: { id: { in: [owner.id, otherUser.id] } } })
    }
  })
})