import { z } from 'zod'
import { prisma } from '@/lib/db'

export const accountTypes = ['savings', 'transaction', 'credit', 'super', 'investment', 'bnpl', 'ewallet', 'loan', 'tax', 'help'] as const
export const transactionStatuses = ['pending', 'confirmed', 'locked'] as const
export const currencies = ['AUD', 'USD', 'EUR', 'GBP', 'NZD'] as const

export const accountTypeSchema = z.enum(accountTypes)
export const transactionStatusSchema = z.enum(transactionStatuses)
export const currencySchema = z.enum(currencies)

export async function ownedFinAccount(userId: string, accountId: string) {
  return prisma.finAccount.findFirst({ where: { id: accountId, userId } })
}

export async function assertOwnedFinAccount(userId: string, accountId?: string | null) {
  if (!accountId) return null
  const account = await ownedFinAccount(userId, accountId)
  if (!account) throw new OwnershipError('Account not found')
  return account
}

export class OwnershipError extends Error {}