import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  assertImmutableCreator,
  assertShareableResourceType,
  calculateExpenseAllocations,
  calculateHouseholdBalances,
  canHousehold,
  createInvitationToken,
  createStorageQrToken,
  hashInvitationToken,
  hashStorageQrToken,
  invitationTokenMatches,
  invitationUsability,
  normalizeStorageLabelValues,
  nextRotationMembership,
  expenseRecurrenceUpdate,
  storageQrPath,
} from '../lib/household.ts'

describe('deny-by-default household roles', () => {
  it('limits every role to its explicit capabilities', () => {
    assert.equal(canHousehold('owner', 'manage_members'), true)
    assert.equal(canHousehold('member', 'invite'), true)
    assert.equal(canHousehold('member', 'manage_members'), false)
    assert.equal(canHousehold('contributor', 'create'), true)
    assert.equal(canHousehold('contributor', 'delete'), false)
    assert.equal(canHousehold('viewer', 'read'), true)
    assert.equal(canHousehold('viewer', 'create'), false)
  })

  it('structurally prohibits sensitive and unknown resource sharing', () => {
    for (const type of ['health', 'medication', 'tax', 'help', 'integration_credentials', 'integration_settings', 'kitchen', 'storage', 'unknown']) {
      assert.throws(() => assertShareableResourceType(type), /cannot be shared/)
    }
    for (const type of ['expense', 'settlement', 'chore', 'pet', 'pet_medication', 'recipe', 'recipe_ingredient', 'food_inventory', 'meal_plan', 'shopping_entry', 'storage_location', 'storage_container', 'storage_item', 'storage_label', 'storage_qr_reference']) {
      assert.doesNotThrow(() => assertShareableResourceType(type))
    }
  })
})

describe('household invitations', () => {
  it('stores a one-way hash and compares a presented token', () => {
    const { token, tokenHash } = createInvitationToken()
    assert.notEqual(token, tokenHash)
    assert.equal(tokenHash, hashInvitationToken(token))
    assert.equal(invitationTokenMatches(token, tokenHash), true)
    assert.equal(invitationTokenMatches(`${token}x`, tokenHash), false)
  })

  it('rejects expired, revoked and already-used invitations', () => {
    const future = new Date('2030-01-02T00:00:00Z')
    const now = new Date('2030-01-01T00:00:00Z')
    assert.equal(invitationUsability({ expiresAt: future, acceptedAt: null, revokedAt: null }, now), 'valid')
    assert.equal(invitationUsability({ expiresAt: now, acceptedAt: null, revokedAt: null }, now), 'expired')
    assert.equal(invitationUsability({ expiresAt: future, acceptedAt: now, revokedAt: null }, now), 'used')
    assert.equal(invitationUsability({ expiresAt: future, acceptedAt: null, revokedAt: now }, now), 'revoked')
  })
})

describe('opaque storage QR references', () => {
  it('creates high-entropy raw references and only derives stable SHA-256 hashes', () => {
    const first = createStorageQrToken()
    const second = createStorageQrToken()
    assert.notEqual(first.token, second.token)
    assert.notEqual(first.token, first.tokenHash)
    assert.equal(first.tokenHash, hashStorageQrToken(first.token))
    assert.match(first.tokenHash, /^[a-f0-9]{64}$/)
    assert.equal(first.tokenHash.includes(first.token.slice(0, 8)), false)
  })

  it('returns only a same-app path so the browser supplies the trusted public origin', () => {
    assert.equal(storageQrPath('opaque token'), '/storage/qr/opaque%20token')
  })

  it('persists labels from both create-form objects and direct API strings', () => {
    assert.deepEqual(
      normalizeStorageLabelValues([{ value: ' winter ' }, 'camping', { value: 'winter' }, {}]),
      ['winter', 'camping'],
    )
    assert.throws(() => normalizeStorageLabelValues('winter'), /array/)
  })
})

describe('expense allocations and balances', () => {
  const members = [{ membershipId: 'a' }, { membershipId: 'b' }, { membershipId: 'c' }]

  it('rounds equal and share splits deterministically without losing cents', () => {
    const equal = calculateExpenseAllocations(10, 'equal', members)
    assert.deepEqual(equal.map((allocation) => allocation.allocatedAmount), [3.34, 3.33, 3.33])
    assert.equal(equal.reduce((sum, allocation) => sum + allocation.allocatedAmount, 0), 10)
    const shares = calculateExpenseAllocations(10, 'shares', [
      { membershipId: 'a', value: 1 },
      { membershipId: 'b', value: 2 },
    ])
    assert.deepEqual(shares.map((allocation) => allocation.allocatedAmount), [3.33, 6.67])
  })

  it('keeps recurring template state synchronized with its rule', () => {
    assert.deepEqual(expenseRecurrenceUpdate(null, 'FREQ=WEEKLY'), { recurringRule: 'FREQ=WEEKLY', isRecurringTemplate: true })
    assert.deepEqual(expenseRecurrenceUpdate('FREQ=WEEKLY', null, true), { recurringRule: null, isRecurringTemplate: true })
    assert.deepEqual(expenseRecurrenceUpdate(null, null, false), { recurringRule: null, isRecurringTemplate: false })
    assert.deepEqual(expenseRecurrenceUpdate('FREQ=WEEKLY', undefined), { recurringRule: 'FREQ=WEEKLY', isRecurringTemplate: true })
    assert.throws(() => expenseRecurrenceUpdate(null, 'FREQ=DAILY'), /Invalid/)
  })

  it('validates percentage, fixed, duplicate and invalid share splits', () => {
    assert.deepEqual(calculateExpenseAllocations(100, 'percentage', [
      { membershipId: 'a', value: 25 },
      { membershipId: 'b', value: 75 },
    ]).map((allocation) => allocation.allocatedAmount), [25, 75])
    assert.deepEqual(calculateExpenseAllocations(10, 'fixed', [
      { membershipId: 'a', value: 4 },
      { membershipId: 'b', value: 6 },
    ]).map((allocation) => allocation.allocatedAmount), [4, 6])
    assert.throws(() => calculateExpenseAllocations(10, 'percentage', [{ membershipId: 'a', value: 90 }]), /total 100/)
    assert.throws(() => calculateExpenseAllocations(10, 'fixed', [{ membershipId: 'a', value: 9 }]), /expense amount/)
    assert.throws(() => calculateExpenseAllocations(10, 'shares', [{ membershipId: 'a', value: 0 }]), /positive/)
    assert.throws(() => calculateExpenseAllocations(10, 'equal', [{ membershipId: 'a' }, { membershipId: 'a' }]), /only appear once/)
  })

  it('reconciles expenses and manual settlements to zero', () => {
    const balances = calculateHouseholdBalances(
      [{ paidByMembershipId: 'a', allocations: [{ membershipId: 'a', allocatedAmount: 30 }, { membershipId: 'b', allocatedAmount: 30 }] }],
      [{ payerMembershipId: 'b', payeeMembershipId: 'a', amount: 30 }],
    )
    assert.deepEqual(balances, { a: 0, b: 0 })
  })
})

describe('immutable shared history', () => {
  it('never permits creator attribution to change', () => {
    assert.doesNotThrow(() => assertImmutableCreator('creator', undefined))
    assert.doesNotThrow(() => assertImmutableCreator('creator', 'creator'))
    assert.throws(() => assertImmutableCreator('creator', 'other'), /immutable/)
  })

  it('rotates recurring chores while skipping removed members', () => {
    const assignments = [
      { membershipId: 'a', rotationOrder: 0 },
      { membershipId: 'b', rotationOrder: 1, removedAt: new Date() },
      { membershipId: 'c', rotationOrder: 2 },
    ]
    assert.equal(nextRotationMembership(assignments, 'a'), 'c')
    assert.equal(nextRotationMembership(assignments, 'c'), 'a')
  })
})