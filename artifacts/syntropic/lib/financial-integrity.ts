/** Pure financial data invariants shared by API and import consumers. */

export type BalanceAccount = {
  id: string
  userId: string
  openingBalance?: number | null
}

export type BalanceTransaction = {
  userId: string
  accountId?: string | null
  amount?: number | null
}

export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/** Returns balances from opening amounts and transactions belonging to the same user. */
export function deriveAccountBalances(
  accounts: readonly BalanceAccount[],
  transactions: readonly BalanceTransaction[],
): Map<string, number> {
  const accountsById = new Map(accounts.map((account) => [account.id, account]))
  const balances = new Map(accounts.map((account) => [account.id, Number(account.openingBalance) || 0]))

  for (const transaction of transactions) {
    if (!transaction.accountId) continue
    const account = accountsById.get(transaction.accountId)
    if (!account || account.userId !== transaction.userId) continue
    balances.set(account.id, roundCurrency((balances.get(account.id) ?? 0) + (Number(transaction.amount) || 0)))
  }

  return balances
}

export type LockableTransaction = {
  status: string
  confirmedAt?: Date | string | null
  manuallyUnlocked?: boolean | null
}

export const TRANSACTION_LOCK_MS = 60 * 24 * 60 * 60 * 1000

/** Confirmed transactions lock strictly after the configured retention period. */
export function isTransactionLocked(
  transaction: LockableTransaction,
  now: Date = new Date(),
  lockMs = TRANSACTION_LOCK_MS,
): boolean {
  if (transaction.status !== 'confirmed' || transaction.manuallyUnlocked || !transaction.confirmedAt) return false
  const confirmedAt = new Date(transaction.confirmedAt).getTime()
  return Number.isFinite(confirmedAt) && now.getTime() - confirmedAt > lockMs
}

export type OwnedResource = { userId: string | null | undefined }

/** Ownership comparisons deliberately fail closed for absent identities. */
export function isOwnedBy(resource: OwnedResource | null | undefined, userId: string | null | undefined): boolean {
  return Boolean(resource?.userId && userId && resource.userId === userId)
}

export type ImportedTransaction = {
  date: Date
  amount: number
  merchant: string | null
  description: string | null
  category: string | null
}

export type ImportColumnMap = Partial<Record<'date' | 'amount' | 'merchant' | 'description' | 'category', string>>
export type ImportRow = Record<string, unknown>

function optionalText(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim()
  return text || null
}

/** Normalise one CSV row without relying on the host timezone or locale. */
export function normaliseImportedTransaction(row: ImportRow, columnMap: ImportColumnMap = {}): ImportedTransaction {
  const dateValue = optionalText(row[columnMap.date ?? 'date'])
  const rawAmount = optionalText(row[columnMap.amount ?? 'amount'])
  if (!dateValue || !rawAmount) throw new Error('missing date or amount')

  const date = new Date(dateValue)
  if (!Number.isFinite(date.getTime())) throw new Error('invalid date')
  const amount = Number(rawAmount.replace(/[$,\s]/g, ''))
  if (!Number.isFinite(amount)) throw new Error('invalid amount')

  return {
    date,
    amount: roundCurrency(amount),
    merchant: optionalText(row[columnMap.merchant ?? 'merchant']),
    description: optionalText(row[columnMap.description ?? 'description']),
    category: optionalText(row[columnMap.category ?? 'category']),
  }
}