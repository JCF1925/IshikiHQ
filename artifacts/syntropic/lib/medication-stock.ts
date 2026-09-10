import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'

const isRetryableTransactionError = (error: any) => error?.code === 'P2034' || error?.code === 'P2002'

const retryDelaysMs = [5, 10, 20, 40, 80, 160, 320] as const

export type StockLedgerEntry = {
  id: string
  date: Date
  quantityChange: number
  balanceAfter: number
  notes: string | null
}

export type StockHistoricalMismatch = {
  id: string
  date: Date
  recordedBalanceAfter: number
  ledgerBalance: number
}

export type StockLedgerDiagnostic = {
  currentQuantity: number
  ledgerQuantity: number
  lastLedgerBalance: number | null
  transactionCount: number
  historicalBalanceMismatchCount: number
  historicalMismatches: StockHistoricalMismatch[]
  hasHistoricalInconsistency: boolean
  mismatchQuantity: number
  hasMismatch: boolean
}

const quantitiesDiffer = (left: number, right: number) => Math.abs(left - right) > 0.0000001
const historicalReconciliationNotePrefix = 'Historical stock reconciliation:'

export function isHistoricalStockReconciliation(entry: Pick<StockLedgerEntry, 'notes'>) {
  return entry.notes?.startsWith(historicalReconciliationNotePrefix) ?? false
}

/**
 * Calculates the balance represented by the operational ledger without
 * trusting any historical balanceAfter value. Older concurrent writes can
 * contain repeated balanceAfter values, so signed transaction changes are the
 * recoverable source of truth. A historical reconciliation row is retained as
 * an append-only audit record, but its correction delta is not replayed: the
 * stock level was already aligned to the ledger balance that it documents.
 */
export function summarizeStockLedger(currentQuantity: number, entries: StockLedgerEntry[]): StockLedgerDiagnostic {
  let ledgerQuantity = 0
  const historicalMismatches: StockHistoricalMismatch[] = []
  for (const entry of entries) {
    if (isHistoricalStockReconciliation(entry)) continue
    ledgerQuantity += entry.quantityChange
    if (quantitiesDiffer(entry.balanceAfter, ledgerQuantity)) {
      historicalMismatches.push({
        id: entry.id,
        date: entry.date,
        recordedBalanceAfter: entry.balanceAfter,
        ledgerBalance: ledgerQuantity,
      })
    }
  }
  const lastLedgerEntry = [...entries].reverse().find(entry => !isHistoricalStockReconciliation(entry))
  const lastLedgerBalance = lastLedgerEntry?.balanceAfter ?? null
  return {
    currentQuantity,
    ledgerQuantity,
    lastLedgerBalance,
    transactionCount: entries.length,
    historicalBalanceMismatchCount: historicalMismatches.length,
    historicalMismatches,
    hasHistoricalInconsistency: historicalMismatches.length > 0,
    mismatchQuantity: ledgerQuantity - currentQuantity,
    hasMismatch: quantitiesDiffer(currentQuantity, ledgerQuantity),
  }
}

export async function getMedicationStockDiagnostic(
  tx: Prisma.TransactionClient,
  userId: string,
  medicationId: string,
): Promise<StockLedgerDiagnostic | null> {
  const stock = await tx.stockLevel.findFirst({
    where: { userId, medicationId },
    select: { currentQuantity: true },
  })
  if (!stock) return null
  const entries = await tx.stockTransaction.findMany({
    where: { userId, medicationId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, date: true, quantityChange: true, balanceAfter: true, notes: true },
  })
  return summarizeStockLedger(stock.currentQuantity, entries)
}

/**
 * Serializes every balance/ledger write for one user's medication.  The
 * advisory lock also covers the read used to calculate balanceAfter, while
 * SERIALIZABLE plus retries handles database-level conflicts.
 */
export async function withMedicationStockTransaction<T>(
  userId: string,
  medicationId: string,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    try {
      return await prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${userId}:${medicationId}`}))`
        return operation(tx)
      }, { isolationLevel: 'Serializable' })
    } catch (error) {
      lastError = error
      if (!isRetryableTransactionError(error) || attempt === retryDelaysMs.length) throw error
      await new Promise(resolve => setTimeout(resolve, retryDelaysMs[attempt]))
    }
  }
  throw lastError
}
