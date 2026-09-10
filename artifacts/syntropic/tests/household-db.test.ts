/* Database acceptance coverage. Enable only against an isolated disposable DB:
 * HOUSEHOLD_DATABASE_TESTS=1 pnpm exec tsx --test tests/household-db.test.ts */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { prisma } from '../lib/db.ts'
import { assertShareableResourceType, calculateHouseholdBalances, canHousehold, changeHouseholdCurrency, completeAndAdvanceHouseholdChore, consumeHouseholdInvitation, createHouseholdExpense, createInvitationToken, expenseRecurrenceUpdate, materialiseHouseholdRecurringExpenses, requireHouseholdCapability, selectHouseholdContext, transitionHouseholdMembership } from '../lib/household.ts'

const enabled = process.env.HOUSEHOLD_DATABASE_TESTS === '1'
describe('household database authorization and aggregate invariants', { skip: !enabled }, () => {
  it('enforces household boundaries, removal, audited recurrence and currency', async () => {
    const suffix = `${Date.now()}-${Math.random()}`
    const owner = await prisma.user.create({ data: { email: `household-owner-${suffix}@example.test` } })
    const member = await prisma.user.create({ data: { email: `household-member-${suffix}@example.test` } })
    const invitee = await prisma.user.create({ data: { email: `household-invitee-${suffix}@example.test` } })
    const owner2 = await prisma.user.create({ data: { email: `household-owner2-${suffix}@example.test` } })
    const householdIds: string[] = []
    try {
      const household = await prisma.household.create({ data: { name: 'DB acceptance', currency: 'AUD', createdById: owner.id, memberships: { create: [{ userId: owner.id, role: 'owner' }, { userId: member.id, role: 'member' }] } }, include: { memberships: true } })
      const second = await prisma.household.create({ data: { name: 'Other', createdById: owner.id, memberships: { create: { userId: owner.id, role: 'owner' } } } })
      householdIds.push(household.id, second.id)
      const memberMembership = household.memberships.find((item) => item.userId === member.id)!
      await assert.rejects(() => selectHouseholdContext(member.id, second.id))
      assert.equal((await selectHouseholdContext(member.id, household.id)).kind, 'household')
      await prisma.householdMembership.update({ where: { id: memberMembership.id }, data: { removedAt: new Date() } })
      await assert.rejects(() => selectHouseholdContext(member.id, household.id))
      assert.equal((await selectHouseholdContext(owner.id, household.id)).kind, 'household')
      assert.equal((await selectHouseholdContext(owner.id, second.id)).kind, 'household')
      await assert.rejects(() => requireHouseholdCapability(member.id, second.id, 'read'))
      for (const role of ['owner', 'member', 'contributor', 'viewer'] as const) for (const capability of ['read', 'create', 'update', 'delete', 'settle', 'invite', 'manage_members', 'manage_household'] as const) assert.equal(canHousehold(role, capability), role === 'owner' || (role === 'member' && ['read', 'create', 'update', 'delete', 'settle', 'invite'].includes(capability)) || (role === 'contributor' && ['read', 'create', 'update'].includes(capability)) || (role === 'viewer' && capability === 'read'))

      const valid = createInvitationToken()
      await prisma.householdInvitation.create({ data: { householdId: household.id, email: invitee.email, role: 'viewer', tokenHash: valid.tokenHash, invitedById: owner.id, expiresAt: new Date(Date.now() + 60_000) } })
      const consumed = await Promise.allSettled([consumeHouseholdInvitation({ userId: invitee.id, email: invitee.email, token: valid.token }), consumeHouseholdInvitation({ userId: invitee.id, email: invitee.email, token: valid.token })])
      assert.equal(consumed.filter(result => result.status === 'fulfilled').length, 1)
      const expired = createInvitationToken()
      await prisma.householdInvitation.create({ data: { householdId: household.id, email: invitee.email, role: 'viewer', tokenHash: expired.tokenHash, invitedById: owner.id, expiresAt: new Date(Date.now() - 1) } })
      await assert.rejects(() => consumeHouseholdInvitation({ userId: invitee.id, email: invitee.email, token: expired.token }), /expired/)
      const revoked = createInvitationToken()
      await prisma.householdInvitation.create({ data: { householdId: household.id, email: invitee.email, role: 'viewer', tokenHash: revoked.tokenHash, invitedById: owner.id, expiresAt: new Date(Date.now() + 60_000), revokedAt: new Date() } })
      await assert.rejects(() => consumeHouseholdInvitation({ userId: invitee.id, email: invitee.email, token: revoked.token }), /revoked/)

      const secondOwner = await prisma.householdMembership.create({ data: { householdId: household.id, userId: owner2.id, role: 'owner' } })
      const ownerMembership = household.memberships.find((item) => item.userId === owner.id)!
      const transitions = await Promise.allSettled([transitionHouseholdMembership({ householdId: household.id, membershipId: ownerMembership.id, actorUserId: owner.id, role: 'member' }), transitionHouseholdMembership({ householdId: household.id, membershipId: secondOwner.id, actorUserId: owner2.id, role: 'member' })])
      assert.equal(transitions.filter(result => result.status === 'fulfilled').length, 1)
      assert.equal(await prisma.householdMembership.count({ where: { householdId: household.id, role: 'owner', removedAt: null } }), 1)

      const activeOwner = await prisma.householdMembership.findFirstOrThrow({ where: { householdId: household.id, role: 'owner', removedAt: null } })
      const template = await prisma.householdExpense.create({ data: { householdId: household.id, createdById: owner.id, paidByMembershipId: activeOwner.id, description: 'Rent', amount: 10, currency: 'AUD', incurredAt: new Date('2030-01-01T00:00:00Z'), recurringRule: 'FREQ=WEEKLY', isRecurringTemplate: true, allocationMethod: 'equal', allocations: { create: { membershipId: activeOwner.id, value: 1, allocatedAmount: 10 } } } })
      await Promise.all([materialiseHouseholdRecurringExpenses(household.id, new Date('2030-01-08T00:00:00Z')), materialiseHouseholdRecurringExpenses(household.id, new Date('2030-01-08T00:00:00Z'))])
      assert.equal(await prisma.householdExpense.count({ where: { recurringSourceId: template.id } }), 2)
      const recipe = await prisma.householdRecipe.create({ data: { householdId: household.id, createdById: member.id, name: 'Creator history', ingredients: { create: { householdId: household.id, createdById: member.id, name: 'Flour' } } }, include: { ingredients: true } })
      assert.equal(recipe.createdById, member.id)
      assert.equal(recipe.ingredients[0].createdById, member.id)
      await assert.rejects(() => requireHouseholdCapability(member.id, household.id, 'read'))
      await assert.rejects(() => prisma.user.delete({ where: { id: member.id } }))
      assert.equal(await prisma.householdExpense.count({ where: { householdId: household.id, isRecurringTemplate: false } }), 2)
      await assert.rejects(() => prisma.household.update({ where: { id: household.id }, data: { currency: 'USD' } }), /currency cannot change/)
      await assert.rejects(() => prisma.householdSettlement.create({ data: { householdId: household.id, payerMembershipId: activeOwner.id, payeeMembershipId: activeOwner.id, amount: 1, currency: 'USD', settledAt: new Date(), createdById: owner.id } }))
      const disabled = expenseRecurrenceUpdate(template.recurringRule, null, template.isRecurringTemplate)
      await prisma.$transaction([
        prisma.householdExpense.update({ where: { id: template.id }, data: disabled }),
        prisma.householdAuditRecord.create({ data: { householdId: household.id, actorUserId: owner.id, action: 'expense_updated', resourceType: 'expense', resourceId: template.id, metadata: { recurring: false } } }),
      ])
      assert.equal((await prisma.householdExpense.findUniqueOrThrow({ where: { id: template.id } })).isRecurringTemplate, true)
      assert.equal(await prisma.householdExpense.count({ where: { recurringSourceId: template.id } }), 2)
      const operational = await prisma.householdExpense.findMany({ where: { householdId: household.id, isRecurringTemplate: false }, include: { allocations: true } })
      assert.equal(operational.length, 2)
      assert.deepEqual(calculateHouseholdBalances(operational as any), { [activeOwner.id]: 0 })
      assert.equal(operational.reduce((total, expense) => total + Number(expense.amount), 0), 20)
      assert.deepEqual(await materialiseHouseholdRecurringExpenses(household.id, new Date('2030-02-01T00:00:00Z')), [])

      const chore = await prisma.householdChore.create({ data: { householdId: household.id, createdById: owner.id, title: 'Bins', recurrenceRule: 'FREQ=WEEKLY', rotationEnabled: true, nextDueAt: new Date('2030-01-01T00:00:00Z'), assignments: { create: [{ membershipId: activeOwner.id, rotationOrder: 0 }, { membershipId: memberMembership.id, rotationOrder: 1 }] } } })
      await Promise.all([completeAndAdvanceHouseholdChore({ householdId: household.id, choreId: chore.id, membershipId: activeOwner.id, actorUserId: owner.id, occurrenceKey: '2030-01-01' }), completeAndAdvanceHouseholdChore({ householdId: household.id, choreId: chore.id, membershipId: activeOwner.id, actorUserId: owner.id, occurrenceKey: '2030-01-01' })])
      assert.equal(await prisma.householdChoreCompletion.count({ where: { choreId: chore.id } }), 1)
      assert.equal((await prisma.householdChore.findUniqueOrThrow({ where: { id: chore.id } })).rotationCursorMembershipId, activeOwner.id)
      await assert.rejects(() => prisma.householdMembership.delete({ where: { id: activeOwner.id } }))
      await assert.rejects(() => prisma.user.delete({ where: { id: member.id } }))
      assert.equal(await prisma.householdChoreCompletion.count({ where: { choreId: chore.id } }), 1)
      assert.equal(await prisma.householdExpense.count({ where: { recurringSourceId: template.id } }), 2)
      assert.ok(await prisma.householdAuditRecord.count({ where: { householdId: household.id } }))
      const audit = await prisma.householdAuditRecord.findFirstOrThrow({ where: { householdId: household.id } })
      await assert.rejects(() => prisma.householdAuditRecord.update({ where: { id: audit.id }, data: { resourceType: 'tampered' } }))
      assert.throws(() => assertShareableResourceType('health'))
      assert.throws(() => assertShareableResourceType('integration_credentials'))

      for (let iteration = 0; iteration < 5; iteration += 1) {
        const raceHousehold = await prisma.household.create({ data: { name: `Currency race ${iteration}`, currency: 'AUD', createdById: owner.id, memberships: { create: { userId: owner.id, role: 'owner' } } }, include: { memberships: true } })
        householdIds.push(raceHousehold.id)
        const raceMember = raceHousehold.memberships[0]
        const raced = await Promise.allSettled([
          changeHouseholdCurrency({ householdId: raceHousehold.id, actorUserId: owner.id, currency: 'USD' }),
          createHouseholdExpense({ householdId: raceHousehold.id, actorUserId: owner.id, paidByMembershipId: raceMember.id, description: 'First charge', amount: 1, requestedCurrency: 'AUD', incurredAt: new Date(), allocationMethod: 'equal', allocations: [{ membershipId: raceMember.id }] }),
        ])
        assert.equal(raced.filter(result => result.status === 'fulfilled').length, 1)
        const finalHousehold = await prisma.household.findUniqueOrThrow({ where: { id: raceHousehold.id } })
        const charges = await prisma.householdExpense.findMany({ where: { householdId: raceHousehold.id } })
        assert.ok(charges.every(charge => charge.currency === finalHousehold.currency))
        assert.ok((finalHousehold.currency === 'USD' && charges.length === 0) || (finalHousehold.currency === 'AUD' && charges.length === 1))
      }
    } finally {
      // Delete only this test's aggregates. Cascades now handle dependencies,
      // but explicit child ordering also validates deterministic cleanup.
      await prisma.householdAuditRecord.deleteMany({ where: { householdId: { in: householdIds } } }).catch(() => undefined)
      await prisma.household.deleteMany({ where: { id: { in: householdIds } } })
      await prisma.user.deleteMany({ where: { id: { in: [owner.id, member.id, invitee.id, owner2.id] } } })
      await prisma.$disconnect()
    }
  })
})