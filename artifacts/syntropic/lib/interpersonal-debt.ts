import { createHmac, timingSafeEqual } from 'node:crypto'
import { prisma } from '@/lib/db'

export const DEBT_MOVEMENT_TYPES = ['principal_advance', 'repayment', 'adjustment', 'confirmed_interest', 'household_expense_allocation', 'household_settlement_allocation'] as const
export type DebtMovementType = typeof DEBT_MOVEMENT_TYPES[number]
export type DebtDirection = 'owed_to_me' | 'owed_by_me'
export type DebtMovementLike = { type: DebtMovementType; amount: number | string | { toString(): string }; effectiveAt?: Date | string }

const n = (v: DebtMovementLike['amount']) => Number(v)
export function movementSign(type: DebtMovementType) {
  return type === 'repayment' ? -1 : 1
}

/** Balance is signed from the user's perspective: positive means owed to user. */
export function deriveDebtBalance(movements: DebtMovementLike[], direction: DebtDirection = 'owed_to_me') {
  const raw = movements.reduce((sum, movement) => sum + movementSign(movement.type) * n(movement.amount), 0)
  return Math.round((direction === 'owed_by_me' ? -raw : raw) * 100) / 100
}

export function explainDebtBalance(movements: DebtMovementLike[], direction: DebtDirection = 'owed_to_me') {
  const balance = deriveDebtBalance(movements, direction)
  return {
    balance,
    status: balance > 0 ? 'owed_to_user' : balance < 0 ? 'owed_by_user' : 'settled',
    components: movements.map((m) => ({ type: m.type, amount: n(m.amount), signedAmount: movementSign(m.type) * n(m.amount) })),
  }
}

export function validateTransactionAllocations(transactionAmount: number | string, allocations: { amount: number | string }[]) {
  const total = allocations.reduce((sum, a) => sum + Math.abs(Number(a.amount)), 0)
  const source = Math.abs(Number(transactionAmount))
  if (!Number.isFinite(source) || source <= 0) throw new Error('Source transaction amount must be non-zero')
  if (allocations.some((a) => !Number.isFinite(Number(a.amount)) || Number(a.amount) <= 0)) throw new Error('Allocation amounts must be positive')
  if (total > source + 0.000001) throw new Error('Debt allocations cannot exceed the source transaction amount')
  return Math.round(total * 100) / 100
}

export function previewSimpleInterest(input: {
  balance: number
  annualRate: number
  from: Date
  through: Date
  direction?: DebtDirection
}) {
  if (input.through <= input.from) return { months: 0, interest: 0, effectiveFrom: input.from }
  const months = Math.max(0, (input.through.getUTCFullYear() - input.from.getUTCFullYear()) * 12 + input.through.getUTCMonth() - input.from.getUTCMonth())
  const cents = Math.max(0, Math.round(Math.abs(input.balance) * 100))
  const interest = Math.round(cents * (input.annualRate / 100) * months / 12) / 100
  return { months, interest, effectiveFrom: input.from }
}

function tokenSecret() {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET is required for interest confirmation')
  return secret
}
export function debtPreviewToken(agreementId: string, ledger: DebtMovementLike[], preview: any) {
  const state = JSON.stringify({ agreementId, ledger: ledger.map((m) => ({ type: m.type, amount: n(m.amount), effectiveAt: m.effectiveAt instanceof Date ? m.effectiveAt.toISOString() : m.effectiveAt })), throughDate: preview.throughDate ?? preview.effectiveFrom, interest: preview.interest })
  const payload = Buffer.from(state).toString('base64url')
  return `${payload}.${createHmac('sha256', tokenSecret()).update(payload).digest('base64url')}`
}
export function verifyDebtPreviewToken(token: string, agreementId: string, ledger: DebtMovementLike[], preview: any) {
  const [payload, signature] = token.split('.')
  if (!payload || !signature) return false
  const expected = createHmac('sha256', tokenSecret()).update(payload).digest('base64url')
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false
  try { const data = JSON.parse(Buffer.from(payload, 'base64url').toString()); return data.agreementId === agreementId && data.throughDate === (preview.throughDate ?? preview.effectiveFrom) && data.interest === preview.interest && debtPreviewToken(agreementId, ledger, preview) === token } catch { return false }
}

export async function getDebtDetail(userId: string, agreementId: string) {
  const agreement = await prisma.debtAgreement.findFirst({ where: { id: agreementId, userId }, include: { person: true, movements: { orderBy: [{ effectiveAt: 'asc' }, { createdAt: 'asc' }], include: { sourceTransaction: true, householdExpense: { include: { linkedTransaction: true } }, householdSettlement: true, allocations: true } } } })
  if (!agreement) throw new Error('Debt agreement not found')
  const explanation = explainDebtBalance(agreement.movements, agreement.direction)
  const principal = agreement.movements.find((m) => m.type === 'principal_advance')
  return { debt: { ...agreement, direction: agreement.direction === 'owed_to_me' ? 'they_owe_me' : 'i_owe_them', principalAmount: Number(principal?.amount ?? 0), startDate: principal?.effectiveAt ?? agreement.createdAt, dueDate: agreement.dueDate, interestAnnualRate: agreement.annualInterestRate, interestStartDate: agreement.interestEffectiveAt }, movements: agreement.movements.map((m) => ({ ...m, note: m.description, transaction: m.sourceTransaction, householdExpense: m.householdExpense, householdSettlement: m.householdSettlement })), balance: explanation.balance, explanation: explanation.status }
}

export async function createDebtMovement(input: { userId: string; agreementId: string; type: DebtMovementType; amount: number; effectiveAt: Date; description?: string; sourceTransactionId?: string; householdExpenseId?: string; householdSettlementId?: string; allocations?: { transactionId: string; amount: number }[] }) {
  if (!DEBT_MOVEMENT_TYPES.includes(input.type) || !Number.isFinite(input.amount) || input.amount <= 0) throw new Error('Invalid debt movement')
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.agreementId}))`
    const agreement = await tx.debtAgreement.findFirst({ where: { id: input.agreementId, userId: input.userId } })
    if (!agreement) throw new Error('Debt agreement not found')
    if (agreement.householdId && agreement.membershipId) {
      const membership = await tx.householdMembership.findFirst({ where: { id: agreement.membershipId, householdId: agreement.householdId, userId: input.userId, removedAt: null } })
      if (!membership) throw new Error('Active household membership required')
    }
    if (!Number.isFinite(input.effectiveAt.getTime())) throw new Error('Invalid effective date')
    if (input.allocations?.length) {
      if (Math.round(input.allocations.reduce((s, a) => s + Number(a.amount), 0) * 100) !== Math.round(input.amount * 100)) throw new Error('Movement amount must equal allocation total')
      const rows = await tx.transaction.findMany({ where: { id: { in: input.allocations.map((a) => a.transactionId) }, userId: input.userId }, select: { id: true, amount: true } })
      if (rows.length !== input.allocations.length) throw new Error('Linked transaction not found')
      for (const row of rows) {
        const old = await tx.debtMovementAllocation.aggregate({ where: { transactionId: row.id }, _sum: { amount: true } })
        validateTransactionAllocations(row.amount, [{ amount: Number(old._sum.amount ?? 0) + input.allocations.filter((a) => a.transactionId === row.id).reduce((s, a) => s + a.amount, 0) }])
      }
    }
    if (input.sourceTransactionId) {
      const source = await tx.transaction.findFirst({ where: { id: input.sourceTransactionId, userId: input.userId }, select: { id: true } })
      if (!source) throw new Error('Linked transaction not found')
    }
    if (agreement.householdId && (input.householdExpenseId || input.householdSettlementId)) {
      if (input.householdExpenseId) {
        const expense = await tx.householdExpense.findFirst({ where: { id: input.householdExpenseId, householdId: agreement.householdId } })
        if (!expense || await tx.debtMovement.count({ where: { agreementId: agreement.id, householdExpenseId: expense.id } })) throw new Error('Household expense is invalid or already allocated')
      }
      if (input.householdSettlementId) {
        const settlement = await tx.householdSettlement.findFirst({ where: { id: input.householdSettlementId, householdId: agreement.householdId } })
        if (!settlement || await tx.debtMovement.count({ where: { agreementId: agreement.id, householdSettlementId: settlement.id } })) throw new Error('Household settlement is invalid or already allocated')
      }
    } else if (input.householdExpenseId || input.householdSettlementId) throw new Error('Household source requires a household debt')
    return tx.debtMovement.create({ data: { agreementId: input.agreementId, createdById: input.userId, type: input.type, amount: input.amount, effectiveAt: input.effectiveAt, description: input.description ?? null, sourceTransactionId: input.sourceTransactionId ?? null, householdExpenseId: input.householdExpenseId ?? null, householdSettlementId: input.householdSettlementId ?? null, allocations: input.allocations?.length ? { create: input.allocations } : undefined }, include: { allocations: true } })
  }, { isolationLevel: 'Serializable' })
}