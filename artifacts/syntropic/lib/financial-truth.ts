import { prisma } from '@/lib/db'

export const TRANSACTION_LOCK_DAYS = 60
export type FinancialTransactionStatus = 'pending' | 'confirmed' | 'locked'

const confirmedStatuses: FinancialTransactionStatus[] = ['confirmed', 'locked']

/**
 * Materialise time-based locks in the ledger. A lock is persisted, rather than
 * inferred at read time, so every state change has a durable audit record.
 */
export async function materialiseDueTransactionLocks(userId: string) {
  const cutoff = new Date(Date.now() - TRANSACTION_LOCK_DAYS * 86_400_000)
  const due = await prisma.transaction.findMany({
    where: { userId, status: 'confirmed', confirmedAt: { lte: cutoff } },
    select: { id: true },
  })
  if (!due.length) return 0

  const now = new Date()
  await prisma.$transaction([
    prisma.transaction.updateMany({
      where: { id: { in: due.map((transaction) => transaction.id) }, userId, status: 'confirmed' },
      data: { status: 'locked', lockedAt: now, manuallyUnlocked: false },
    }),
    prisma.transactionAuditRecord.createMany({
      data: due.map((transaction) => ({
        userId,
        transactionId: transaction.id,
        action: 'locked',
        previousStatus: 'confirmed',
        nextStatus: 'locked',
        reason: 'Automatically locked 60 days after confirmation',
      })),
    }),
  ])
  return due.length
}

/** Account balances are derived from posted ledger entries, never a cache. */
export async function getDerivedAccountBalances(userId: string, activeOnly = false) {
  const [accounts, totals] = await Promise.all([
    prisma.finAccount.findMany({ where: { userId, ...(activeOnly ? { isActive: true } : {}) }, orderBy: { name: 'asc' } }),
    prisma.transaction.groupBy({
      by: ['accountId'],
      where: { userId, accountId: { not: null }, status: { in: confirmedStatuses } },
      _sum: { amount: true },
    }),
  ])
  const totalByAccount = new Map(totals.map((total) => [total.accountId, total._sum.amount ?? 0]))
  return accounts.map((account) => ({
    ...account,
    derivedBalance: (account.openingBalance ?? 0) + (totalByAccount.get(account.id) ?? 0),
  }))
}

export async function writeTransactionAudit(input: {
  userId: string
  transactionId: string
  action: 'created' | 'confirmed' | 'locked' | 'unlocked' | 'updated' | 'deleted'
  previousStatus?: FinancialTransactionStatus
  nextStatus?: FinancialTransactionStatus
  reason?: string | null
  changes?: unknown
}) {
  return prisma.transactionAuditRecord.create({
    data: {
      ...input,
      previousStatus: input.previousStatus,
      nextStatus: input.nextStatus,
      reason: input.reason ?? null,
      changes: input.changes === undefined ? undefined : (input.changes as any),
    },
  })
}