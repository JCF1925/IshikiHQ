import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { advance, occurrencesBetween } from '@/lib/recurrence'

export const HOUSEHOLD_ROLES = ['owner', 'member', 'contributor', 'viewer'] as const
export type HouseholdRoleName = (typeof HOUSEHOLD_ROLES)[number]
export type HouseholdCapability =
  | 'read'
  | 'create'
  | 'update'
  | 'delete'
  | 'settle'
  | 'invite'
  | 'manage_members'
  | 'manage_household'

const ROLE_CAPABILITIES: Record<HouseholdRoleName, ReadonlySet<HouseholdCapability>> = {
  owner: new Set(['read', 'create', 'update', 'delete', 'settle', 'invite', 'manage_members', 'manage_household']),
  member: new Set(['read', 'create', 'update', 'delete', 'settle', 'invite']),
  contributor: new Set(['read', 'create', 'update']),
  viewer: new Set(['read']),
}

// This allowlist is the structural sharing boundary. Never replace it with a
// denylist: newly-added private modules must remain private by default.
export const HOUSEHOLD_SHAREABLE_RESOURCE_TYPES = new Set([
  'expense',
  'settlement',
  'chore',
  'chore_completion',
  'pet',
  'pet_care_schedule',
  'pet_appointment',
  'pet_medication',
  'pet_cost',
  'recipe',
  'recipe_ingredient',
  'food_inventory',
  'meal_plan',
  'shopping_entry',
  'storage_location',
  'storage_container',
  'storage_item',
  'storage_label',
  'storage_qr_reference',
] as const)

export function isHouseholdRole(value: unknown): value is HouseholdRoleName {
  return typeof value === 'string' && (HOUSEHOLD_ROLES as readonly string[]).includes(value)
}

export function canHousehold(role: HouseholdRoleName, capability: HouseholdCapability) {
  return ROLE_CAPABILITIES[role].has(capability)
}

export function assertShareableResourceType(type: string) {
  if (!HOUSEHOLD_SHAREABLE_RESOURCE_TYPES.has(type as never)) {
    throw new HouseholdAccessError(`Resource type "${type}" cannot be shared`, 400)
  }
}

export class HouseholdAccessError extends Error {
  constructor(message = 'Forbidden', readonly status = 403) {
    super(message)
    this.name = 'HouseholdAccessError'
  }
}

export type HouseholdContext =
  | { kind: 'private'; userId: string }
  | { kind: 'household'; userId: string; householdId: string; membershipId: string; role: HouseholdRoleName }

/** Missing selection means private context; a household is never inferred. */
export async function selectHouseholdContext(userId: string, householdId?: string | null): Promise<HouseholdContext> {
  if (!householdId || householdId === 'private') return { kind: 'private', userId }
  const membership = await prisma.householdMembership.findUnique({
    where: { householdId_userId: { householdId, userId } },
    select: { id: true, role: true, removedAt: true },
  })
  if (!membership || membership.removedAt) throw new HouseholdAccessError()
  return { kind: 'household', userId, householdId, membershipId: membership.id, role: membership.role }
}

export async function requireHouseholdCapability(
  userId: string,
  householdId: string,
  capability: HouseholdCapability,
) {
  const context = await selectHouseholdContext(userId, householdId)
  if (context.kind !== 'household' || !canHousehold(context.role, capability)) throw new HouseholdAccessError()
  return context
}

/** Serializes aggregate-wide invariants such as owner and currency changes. */
export async function lockHousehold(tx: Prisma.TransactionClient, householdId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${householdId}))`
}

export async function changeHouseholdCurrency(input: { householdId: string; actorUserId: string; currency: string }) {
  await requireHouseholdCapability(input.actorUserId, input.householdId, 'manage_household')
  return serializableRetry(() => prisma.$transaction(async tx => {
    await lockHousehold(tx, input.householdId)
    const household = await tx.household.findUniqueOrThrow({ where: { id: input.householdId } })
    if (household.currency === input.currency) return household
    const [expenses, settlements] = await Promise.all([
      tx.householdExpense.count({ where: { householdId: input.householdId } }),
      tx.householdSettlement.count({ where: { householdId: input.householdId } }),
    ])
    if (expenses || settlements) throw new HouseholdAccessError('Household currency cannot change after financial records exist', 409)
    const updated = await tx.household.update({ where: { id: input.householdId }, data: { currency: input.currency } })
    await tx.householdAuditRecord.create({ data: { householdId: input.householdId, actorUserId: input.actorUserId, action: 'household_updated', resourceType: 'household', resourceId: input.householdId, metadata: { currency: input.currency } } })
    return updated
  }, { isolationLevel: 'Serializable' }))
}

export async function createHouseholdExpense(input: {
  householdId: string; actorUserId: string; paidByMembershipId: string; description: string; amount: number
  requestedCurrency?: string; incurredAt: Date; recurringRule?: string | null; allocationMethod: AllocationMethod
  allocations: AllocationInput[]; linkedTransactionId?: string | null; notes?: string | null
}) {
  await requireHouseholdCapability(input.actorUserId, input.householdId, 'create')
  return serializableRetry(() => prisma.$transaction(async tx => {
    await lockHousehold(tx, input.householdId)
    const household = await tx.household.findUniqueOrThrow({ where: { id: input.householdId }, select: { currency: true } })
    if (input.requestedCurrency && input.requestedCurrency !== household.currency) throw new HouseholdAccessError(`Expenses must use household currency ${household.currency}`, 400)
    const allocationRows = calculateExpenseAllocations(input.amount, input.allocationMethod, input.allocations)
    const memberIds = [input.paidByMembershipId, ...allocationRows.map(item => item.membershipId)]
    if (await tx.householdMembership.count({ where: { householdId: input.householdId, id: { in: memberIds }, removedAt: null } }) !== new Set(memberIds).size) throw new HouseholdAccessError('Allocations must reference active members', 400)
    const expense = await tx.householdExpense.create({ data: { householdId: input.householdId, createdById: input.actorUserId, paidByMembershipId: input.paidByMembershipId, description: input.description, amount: input.amount, currency: household.currency, incurredAt: input.incurredAt, recurringRule: input.recurringRule ?? null, isRecurringTemplate: Boolean(input.recurringRule), allocationMethod: input.allocationMethod, linkedTransactionId: input.linkedTransactionId ?? null, notes: input.notes ?? null, allocations: { create: allocationRows } }, include: { allocations: true } })
    await tx.householdAuditRecord.create({ data: { householdId: input.householdId, actorUserId: input.actorUserId, action: 'expense_created', resourceType: 'expense', resourceId: expense.id } })
    return expense
  }, { isolationLevel: 'Serializable' }))
}

export async function createHouseholdSettlement(input: { householdId: string; actorUserId: string; payerMembershipId: string; payeeMembershipId: string; amount: number; requestedCurrency?: string; settledAt: Date; note?: string | null }) {
  await requireHouseholdCapability(input.actorUserId, input.householdId, 'settle')
  return serializableRetry(() => prisma.$transaction(async tx => {
    await lockHousehold(tx, input.householdId)
    const household = await tx.household.findUniqueOrThrow({ where: { id: input.householdId }, select: { currency: true } })
    if (input.requestedCurrency && input.requestedCurrency !== household.currency) throw new HouseholdAccessError(`Settlements must use household currency ${household.currency}`, 400)
    if (!(input.amount > 0) || input.payerMembershipId === input.payeeMembershipId) throw new HouseholdAccessError('A positive settlement between two different members is required', 400)
    const ids = [input.payerMembershipId, input.payeeMembershipId]
    if (await tx.householdMembership.count({ where: { householdId: input.householdId, id: { in: ids }, removedAt: null } }) !== 2) throw new HouseholdAccessError('Settlement members must be active', 400)
    const settlement = await tx.householdSettlement.create({ data: { householdId: input.householdId, payerMembershipId: ids[0], payeeMembershipId: ids[1], amount: input.amount, currency: household.currency, settledAt: input.settledAt, note: input.note ?? null, createdById: input.actorUserId } })
    await tx.householdAuditRecord.create({ data: { householdId: input.householdId, actorUserId: input.actorUserId, action: 'settlement_created', resourceType: 'settlement', resourceId: settlement.id, metadata: { amount: input.amount, payerMembershipId: ids[0], payeeMembershipId: ids[1] } } })
    return settlement
  }, { isolationLevel: 'Serializable' }))
}

export async function consumeHouseholdInvitation(input: { userId: string; email: string; token: string; now?: Date }) {
  const now = input.now ?? new Date()
  return serializableRetry(async () => prisma.$transaction(async tx => {
    const invitation = await tx.householdInvitation.findUnique({ where: { tokenHash: hashInvitationToken(input.token) } })
    if (!invitation || invitation.email !== input.email.trim().toLowerCase()) throw new HouseholdAccessError('Invitation is invalid', 400)
    const usability = invitationUsability(invitation, now)
    if (usability !== 'valid') throw new HouseholdAccessError(`Invitation is ${usability}`, 400)
    const consumed = await tx.householdInvitation.updateMany({ where: { id: invitation.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } }, data: { acceptedAt: now, acceptedById: input.userId } })
    if (consumed.count !== 1) throw new HouseholdAccessError('Invitation has already been used', 409)
    const membership = await tx.householdMembership.upsert({ where: { householdId_userId: { householdId: invitation.householdId, userId: input.userId } }, create: { householdId: invitation.householdId, userId: input.userId, role: invitation.role }, update: { role: invitation.role, removedAt: null, joinedAt: now } })
    await tx.householdAuditRecord.create({ data: { householdId: invitation.householdId, actorUserId: input.userId, action: 'invitation_accepted', resourceType: 'invitation', resourceId: invitation.id, subjectUserId: input.userId } })
    return membership
  }, { isolationLevel: 'Serializable' }))
}

export async function transitionHouseholdMembership(input: { householdId: string; membershipId: string; actorUserId: string; role?: HouseholdRoleName; remove?: boolean }) {
  const capability = await requireHouseholdCapability(input.actorUserId, input.householdId, 'manage_members')
  if (!input.remove && !input.role) throw new HouseholdAccessError('Role is required', 400)
  return prisma.$transaction(async tx => {
    await lockHousehold(tx, input.householdId)
    const member = await tx.householdMembership.findFirst({ where: { id: input.membershipId, householdId: input.householdId, removedAt: null } })
    if (!member) throw new HouseholdAccessError('Member not found', 404)
    if (member.role === 'owner' && (input.remove || input.role !== 'owner')) {
      const owners = await tx.householdMembership.count({ where: { householdId: input.householdId, role: 'owner', removedAt: null } })
      if (owners <= 1) throw new HouseholdAccessError('The last owner cannot be removed or demoted', 409)
    }
    const updated = await tx.householdMembership.update({ where: { id: member.id }, data: input.remove ? { removedAt: new Date() } : { role: input.role } })
    await tx.householdAuditRecord.create({ data: { householdId: input.householdId, actorUserId: capability.userId, action: input.remove ? 'member_removed' : 'member_role_changed', resourceType: 'membership', resourceId: member.id, subjectUserId: member.userId, metadata: input.remove ? undefined : { from: member.role, to: input.role } } })
    return updated
  }, { isolationLevel: 'Serializable' })
}

export function hashInvitationToken(token: string) {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function createInvitationToken() {
  const token = randomBytes(32).toString('base64url')
  return { token, tokenHash: hashInvitationToken(token) }
}

export function hashStorageQrToken(token: string) {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/** Returns the only copy of the opaque QR token; callers persist tokenHash. */
export function createStorageQrToken() {
  const token = randomBytes(32).toString('base64url')
  return { token, tokenHash: hashStorageQrToken(token) }
}

export function storageQrPath(token: string) {
  return `/storage/qr/${encodeURIComponent(token)}`
}

export function normalizeStorageLabelValues(labels: unknown) {
  if (!Array.isArray(labels)) throw new Error('Labels must be an array')
  return [...new Set(labels.flatMap((label) => {
    const raw = typeof label === 'string'
      ? label
      : label && typeof label === 'object' && 'value' in label
        ? (label as { value?: unknown }).value
        : null
    return typeof raw === 'string' && raw.trim() ? [raw.trim()] : []
  }))]
}

export function invitationTokenMatches(token: string, tokenHash: string) {
  const actual = Uint8Array.from(Buffer.from(hashInvitationToken(token), 'hex'))
  const expected = Uint8Array.from(Buffer.from(tokenHash, 'hex'))
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function invitationUsability(
  invitation: { expiresAt: Date; acceptedAt: Date | null; revokedAt: Date | null },
  now = new Date(),
) {
  if (invitation.revokedAt) return 'revoked' as const
  if (invitation.acceptedAt) return 'used' as const
  if (invitation.expiresAt.getTime() <= now.getTime()) return 'expired' as const
  return 'valid' as const
}

type AllocationInput = { membershipId: string; value?: number }
export type AllocationMethod = 'equal' | 'percentage' | 'fixed' | 'shares'

function cents(value: number) {
  if (!Number.isFinite(value) || value < 0) throw new Error('Allocation values must be non-negative finite numbers')
  return Math.round((value + Number.EPSILON) * 100)
}

/** Computes deterministic cent-perfect allocations; remainder cents follow input order. */
export function calculateExpenseAllocations(amount: number, method: AllocationMethod, inputs: AllocationInput[]) {
  const totalCents = cents(amount)
  if (totalCents <= 0) throw new Error('Expense amount must be greater than zero')
  if (!inputs.length) throw new Error('At least one allocation is required')
  if (new Set(inputs.map((item) => item.membershipId)).size !== inputs.length) {
    throw new Error('Each member may only appear once')
  }

  let raw: number[]
  if (method === 'equal') {
    raw = inputs.map(() => totalCents / inputs.length)
  } else if (method === 'percentage') {
    const values = inputs.map((item) => item.value ?? NaN)
    if (values.some((value) => !Number.isFinite(value) || value < 0) || Math.abs(values.reduce((a, b) => a + b, 0) - 100) > 0.0001) {
      throw new Error('Percentage allocations must total 100')
    }
    raw = values.map((value) => totalCents * value / 100)
  } else if (method === 'fixed') {
    const values = inputs.map((item) => item.value ?? NaN)
    if (values.some((value) => !Number.isFinite(value) || value < 0) || values.reduce((a, b) => a + cents(b), 0) !== totalCents) {
      throw new Error('Fixed allocations must total the expense amount')
    }
    raw = values.map(cents)
  } else {
    const shares = inputs.map((item) => item.value ?? NaN)
    const totalShares = shares.reduce((a, b) => a + b, 0)
    if (shares.some((value) => !Number.isFinite(value) || value <= 0) || totalShares <= 0) {
      throw new Error('Share allocations must be positive')
    }
    raw = shares.map((value) => totalCents * value / totalShares)
  }

  const allocated = raw.map(Math.floor)
  const remainder = totalCents - allocated.reduce((a, b) => a + b, 0)
  const priority = raw.map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)
  for (let index = 0; index < remainder; index += 1) allocated[priority[index % priority.length].index] += 1
  return inputs.map((input, index) => ({
    membershipId: input.membershipId,
    value: method === 'equal' ? 1 : input.value!,
    allocatedAmount: allocated[index] / 100,
  }))
}

export type BalanceExpense = { paidByMembershipId: string; allocations: { membershipId: string; allocatedAmount: number | string | { toString(): string } }[] }
export type BalanceSettlement = { payerMembershipId: string; payeeMembershipId: string; amount: number | string | { toString(): string } }

/** Positive means the household owes the member; negative means they owe it. */
export function calculateHouseholdBalances(expenses: BalanceExpense[], settlements: BalanceSettlement[] = []) {
  const balances = new Map<string, number>()
  const add = (id: string, amount: number) => balances.set(id, (balances.get(id) ?? 0) + amount)
  for (const expense of expenses) {
    let paid = 0
    for (const allocation of expense.allocations) {
      const value = Number(allocation.allocatedAmount)
      add(allocation.membershipId, -value)
      paid += value
    }
    add(expense.paidByMembershipId, paid)
  }
  for (const settlement of settlements) {
    const amount = Number(settlement.amount)
    add(settlement.payerMembershipId, amount)
    add(settlement.payeeMembershipId, -amount)
  }
  return Object.fromEntries([...balances].map(([id, amount]) => [id, Math.round(amount * 100) / 100]))
}

export function assertImmutableCreator(existingCreatorId: string, requestedCreatorId: unknown) {
  if (requestedCreatorId !== undefined && requestedCreatorId !== existingCreatorId) {
    throw new HouseholdAccessError('Creator attribution is immutable', 400)
  }
}

/** Selects the next active assignment after the latest completion. */
export function nextRotationMembership(
  assignments: { membershipId: string; rotationOrder: number; removedAt?: Date | null }[],
  lastMembershipId?: string | null,
) {
  const active = assignments.filter((item) => !item.removedAt).sort((a, b) => a.rotationOrder - b.rotationOrder || a.membershipId.localeCompare(b.membershipId))
  if (!active.length) return null
  const index = active.findIndex((item) => item.membershipId === lastMembershipId)
  return active[(index + 1) % active.length].membershipId
}

export function parseHouseholdRecurrence(rule: string) {
  // Household APIs accept either an RRULE subset or { frequency, interval }.
  try {
    const value = JSON.parse(rule)
    if (value?.frequency) {
      const frequency = String(value.frequency)
      const interval = value.interval === undefined ? 1 : Number(value.interval)
      if (!['weekly', 'fortnightly', 'monthly', 'quarterly', 'annually'].includes(frequency) || !Number.isInteger(interval) || interval < 1 || interval > 365) throw new Error('Invalid household recurrence rule')
      return { frequency, interval }
    }
  } catch { /* RRULE form */ }
  const parts = Object.fromEntries(rule.split(';').map((part) => part.split('=')))
  const map: Record<string, string> = { WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'annually' }
  const frequency = map[parts.FREQ]
  const interval = parts.INTERVAL === undefined ? 1 : Number(parts.INTERVAL)
  if (!frequency || !Number.isInteger(interval) || interval < 1 || interval > 365 || Object.keys(parts).some((key) => key !== 'FREQ' && key !== 'INTERVAL')) throw new Error('Invalid household recurrence rule')
  return { frequency, interval }
}

export function expenseRecurrenceUpdate(existingRule: string | null, requestedRule: unknown, existingIsTemplate = existingRule !== null) {
  if (requestedRule === undefined) return { recurringRule: existingRule, isRecurringTemplate: existingIsTemplate }
  // Clearing a former template archives its instruction but never turns that
  // instruction row into a charge. A genuine one-off remains a one-off.
  if (requestedRule === null || requestedRule === '') return { recurringRule: null, isRecurringTemplate: existingIsTemplate }
  if (typeof requestedRule !== 'string') throw new Error('Invalid household recurrence rule')
  parseHouseholdRecurrence(requestedRule)
  return { recurringRule: requestedRule, isRecurringTemplate: true }
}

const isSerializationFailure = (error: any) => error?.code === 'P2034' || error?.code === 'P2002'
async function serializableRetry<T>(operation: () => Promise<T>): Promise<T> {
  let last: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return await operation() } catch (error) { last = error; if (!isSerializationFailure(error) || attempt === 2) throw error }
  }
  throw last
}

/** Materialises recurring templates exactly once per due timestamp, with audit rows. */
export async function materialiseHouseholdRecurringExpenses(householdId: string, through = new Date()) {
  return serializableRetry(async () => prisma.$transaction(async (tx) => {
    const household = await tx.household.findUniqueOrThrow({ where: { id: householdId }, select: { currency: true } })
    const templates = await tx.householdExpense.findMany({ where: { householdId, isRecurringTemplate: true, recurringRule: { not: null } }, include: { allocations: true } })
    const created: string[] = []
    for (const template of templates) {
      const { frequency, interval } = parseHouseholdRecurrence(template.recurringRule!)
      const dates = occurrencesBetween(template.incurredAt, frequency, interval, new Date(template.incurredAt.getTime() - 1), through)
      for (const incurredAt of dates) {
        const occurrenceKey = incurredAt.toISOString()
        // Check first for ordinary replays. A concurrent insertion can still
        // hit the unique constraint; serializableRetry then reruns and sees it.
        const exists = await tx.householdExpense.findUnique({ where: { recurringSourceId_occurrenceKey: { recurringSourceId: template.id, occurrenceKey } }, select: { id: true } })
        if (exists) continue
        const expense = await tx.householdExpense.create({
          data: { householdId, createdById: template.createdById, description: template.description, amount: template.amount, currency: household.currency, incurredAt, allocationMethod: template.allocationMethod, paidByMembershipId: template.paidByMembershipId, notes: template.notes, recurringSourceId: template.id, occurrenceKey, allocations: { create: template.allocations.map(({ membershipId, value, allocatedAmount }) => ({ membershipId, value, allocatedAmount })) } },
        })
        created.push(expense.id)
        await tx.householdAuditRecord.create({ data: { householdId, actorUserId: template.createdById, action: 'expense_created', resourceType: 'recurring_expense_occurrence', resourceId: expense.id, metadata: { templateId: template.id, occurrenceKey } } })
      }
    }
    return created
  }, { isolationLevel: 'Serializable' }))
}

/** Records one recurrence completion and atomically advances its next due date and rotation cursor. */
export async function completeAndAdvanceHouseholdChore(input: { householdId: string; choreId: string; membershipId: string; actorUserId: string; occurrenceKey: string; completedAt?: Date; note?: string | null }) {
  return serializableRetry(async () => prisma.$transaction(async (tx) => {
    const chore = await tx.householdChore.findFirstOrThrow({ where: { id: input.choreId, householdId: input.householdId }, include: { assignments: { include: { membership: { select: { removedAt: true } } } } } })
    const existing = await tx.householdChoreCompletion.findUnique({ where: { choreId_occurrenceKey: { choreId: input.choreId, occurrenceKey: input.occurrenceKey } } })
    if (existing) return { completion: existing, idempotent: true }
    const member = await tx.householdMembership.findFirst({ where: { id: input.membershipId, householdId: input.householdId, removedAt: null } })
    if (!member) throw new HouseholdAccessError('Active member not found', 400)
    const completedAt = input.completedAt ?? new Date()
    const recurrence = chore.recurrenceRule ? parseHouseholdRecurrence(chore.recurrenceRule) : null
    const nextDueAt = recurrence && chore.nextDueAt ? advance(chore.nextDueAt, recurrence.frequency, recurrence.interval) : chore.nextDueAt
    const cursor = chore.rotationEnabled ? nextRotationMembership(chore.assignments.map((assignment) => ({ membershipId: assignment.membershipId, rotationOrder: assignment.rotationOrder, removedAt: assignment.membership.removedAt })), chore.rotationCursorMembershipId ?? input.membershipId) : chore.rotationCursorMembershipId
    const completion = await tx.householdChoreCompletion.create({ data: { householdId: input.householdId, choreId: input.choreId, membershipId: input.membershipId, completedById: input.actorUserId, completedAt, occurrenceKey: input.occurrenceKey, note: input.note ?? null } })
    await tx.householdChore.update({ where: { id: input.choreId }, data: { nextDueAt, rotationCursorMembershipId: cursor } })
    await tx.householdAuditRecord.create({ data: { householdId: input.householdId, actorUserId: input.actorUserId, action: 'chore_completed', resourceType: 'chore_completion', resourceId: completion.id, metadata: { occurrenceKey: input.occurrenceKey, nextDueAt: nextDueAt?.toISOString(), rotationCursorMembershipId: cursor } } })
    return { completion, idempotent: false }
  }, { isolationLevel: 'Serializable' }))
}