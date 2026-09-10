export const dynamic = "force-dynamic";
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { materialiseDueTransactionLocks } from '@/lib/financial-truth'
import { apiError, apiSuccess, parseBody } from '@/lib/api'
import { assertOwnedFinAccount, OwnershipError } from '@/lib/domain'
import { transactionCreateSchema } from '@/lib/validation'
import { ensureCategorySuggestion } from '@/lib/category-suggestions'

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const userId = (session.user as any).id
  await materialiseDueTransactionLocks(userId)
  const url = new URL(request.url)
  const accountId = url.searchParams.get('accountId')
  const category = url.searchParams.get('category')
  const deductible = url.searchParams.get('deductible')
  const status = url.searchParams.get('status')
  const includeHidden = url.searchParams.get('includeHidden') === 'true'
  const review = url.searchParams.get('review') === 'true'
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') ?? '50') || 50, 1), 100)
  const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0') || 0, 0)

  const where: any = { userId }
  if (accountId) where.accountId = accountId
  if (category) where.category = category
  if (deductible === 'true') where.isDeductible = true
  if (status) where.status = status
  // Transfers & dishonoured txns are retained (for balances) but hidden from the main list by default
  if (!includeHidden) { where.isTransfer = false; where.isDishonoured = false }
  // Exception / confirmation queue: unconfirmed txns OR those missing a category, needing manual attention
  if (review) {
    where.AND = [
      ...(where.AND ?? []),
      { OR: [{ status: 'pending' }, { category: null }, { category: '' }] },
    ]
  }
  if (from || to) {
    where.date = {}
    if (from) where.date.gte = new Date(from)
    if (to) where.date.lte = new Date(to)
  }

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: { account: true },
      orderBy: { date: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.transaction.count({ where }),
  ])

  await Promise.all(transactions.map((transaction) => ensureCategorySuggestion(userId, transaction.id)))
  const suggestions = await prisma.categorySuggestion.findMany({
    where: { transactionId: { in: transactions.map((item) => item.id) }, decision: 'pending' },
    orderBy: { createdAt: 'desc' },
  })
  const byTransaction = new Map(suggestions.map((item) => [item.transactionId, item]))
  const mapped = transactions.map((t) => {
    const suggestion = byTransaction.get(t.id) ?? null
    return {
      ...t,
      // A persisted/manual category always wins over a stale suggestion.
      category: !t.category && suggestion?.autoApplied ? suggestion.suggestedCategory : t.category,
      categorySuggestion: suggestion,
      locked: t.status === 'locked',
    }
  })

  return apiSuccess({ transactions: mapped, total })
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const userId = (session.user as any).id
  const parsed = await parseBody(request, transactionCreateSchema)
  if (!parsed.success) return parsed.response
  const body = parsed.data
  const { amount, date } = body
  try {
    await assertOwnedFinAccount(userId, body.accountId)
  } catch (error) {
    if (error instanceof OwnershipError) return apiError('NOT_FOUND', 'Account not found', 404)
    throw error
  }

  const transaction = await prisma.$transaction(async (tx) => {
    const created = await tx.transaction.create({ data: {
      userId,
      date,
      amount,
      currency: body.currency ?? 'AUD',
      merchant: body.merchant ?? null,
      description: body.description ?? null,
      category: body.category ?? null,
      subcategory: body.subcategory ?? null,
      accountId: body.accountId ?? null,
      isDeductible: body.isDeductible ?? false,
      taxCategory: body.taxCategory ?? null,
      isTransfer: body.isTransfer ?? false,
      isDishonoured: body.isDishonoured ?? false,
      isRecurring: body.isRecurring ?? false,
      tags: body.tags ?? [],
      notes: body.notes ?? null,
      receiptPath: body.receiptPath ?? null,
      receiptIsPublic: body.receiptIsPublic ?? false,
      status: 'pending',
    } })
    await tx.transactionAuditRecord.create({
      data: { userId, transactionId: created.id, action: 'created', nextStatus: 'pending', changes: { source: 'manual' } },
    })
    return created
  })

  return apiSuccess(transaction, { status: 201 })
}
