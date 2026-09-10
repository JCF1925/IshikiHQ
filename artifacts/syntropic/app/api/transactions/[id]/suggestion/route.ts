export const dynamic = 'force-dynamic'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { apiError, apiSuccess } from '@/lib/api'
import { normalizeMerchant } from '@/lib/automation-beta'
import { shouldRevertAutoCategory } from '@/lib/automation-beta'

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const userId = (session.user as any).id
  const { id } = await params
  const body = await request.json()
  if (!['accept', 'reject', 'correct'].includes(body.action)) return apiError('VALIDATION_ERROR', 'Invalid suggestion decision', 400)
  const suggestion = await prisma.categorySuggestion.findFirst({
    where: { id: body.suggestionId, transactionId: id, userId, decision: 'pending' },
    include: { transaction: true },
  })
  if (!suggestion) return apiError('NOT_FOUND', 'Pending suggestion not found', 404)
  if (suggestion.transaction.status === 'locked') return apiError('LOCKED', 'Transaction is locked', 423)
  const category = body.action === 'correct' ? String(body.category ?? '').trim() : suggestion.suggestedCategory
  if (body.action !== 'reject' && !category) return apiError('VALIDATION_ERROR', 'Category is required', 400)
  await prisma.$transaction(async (tx) => {
    if (body.action !== 'reject') await tx.transaction.update({ where: { id }, data: { category } })
    else if (shouldRevertAutoCategory(suggestion.autoApplied, suggestion.transaction.category, suggestion.suggestedCategory)) {
      // Never erase a category changed manually after auto-allocation.
      await tx.transaction.update({ where: { id }, data: { category: suggestion.previousCategory } })
    }
    await tx.categorySuggestion.update({
      where: { id: suggestion.id },
      data: { decision: body.action === 'accept' ? 'accepted' : body.action === 'reject' ? 'rejected' : 'corrected', decidedAt: new Date() },
    })
    if (body.action !== 'reject') await tx.categoryCorrection.create({
      data: {
        userId, transactionId: id, suggestionId: suggestion.id,
        normalizedMerchant: suggestion.normalizedMerchant || normalizeMerchant(suggestion.transaction.merchant || suggestion.transaction.description),
        previousCategory: suggestion.previousCategory, confirmedCategory: category, explicitlyConfirmed: true,
      },
    })
  })
  return apiSuccess({ decision: body.action, category: body.action === 'reject' ? suggestion.previousCategory : category })
}