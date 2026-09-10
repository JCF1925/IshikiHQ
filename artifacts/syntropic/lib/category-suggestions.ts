import { prisma } from '@/lib/db'
import { categoryConfidence, normalizeMerchant, shouldAutoApplyCategory } from '@/lib/automation-beta'

export async function ensureCategorySuggestion(userId: string, transactionId: string) {
  const transaction = await prisma.transaction.findFirst({ where: { id: transactionId, userId } })
  if (!transaction || transaction.category || (!transaction.merchant && !transaction.description)) return null
  const current = await prisma.categorySuggestion.findFirst({
    where: { transactionId, decision: 'pending' },
    orderBy: { createdAt: 'desc' },
  })
  if (current) return current
  const normalizedMerchant = normalizeMerchant(transaction.merchant || transaction.description)
  const corrections = await prisma.categoryCorrection.findMany({
    where: { userId, normalizedMerchant, explicitlyConfirmed: true },
    select: { normalizedMerchant: true, confirmedCategory: true, explicitlyConfirmed: true },
  })
  const evidence = categoryConfidence(normalizedMerchant, corrections.map((item) => ({
    normalizedMerchant: item.normalizedMerchant ?? '',
    category: item.confirmedCategory,
    explicitlyConfirmed: item.explicitlyConfirmed,
  })))
  if (!evidence) return null
  const setting = await prisma.automationSetting.findUnique({ where: { userId } })
  const threshold = setting?.categoryAutoApplyThreshold ?? 0.9
  const autoApplied = shouldAutoApplyCategory(evidence.confidence, threshold)
  return prisma.$transaction(async (tx) => {
    const suggestion = await tx.categorySuggestion.create({
      data: {
        userId, transactionId, suggestedCategory: evidence.category,
        confidence: evidence.confidence, normalizedMerchant,
        evidence: {
          basis: 'explicitly_confirmed_history',
          matchingCount: evidence.matchingCount,
          evidenceCount: evidence.evidenceCount,
        },
        autoApplied, previousCategory: transaction.category,
      },
    })
    if (autoApplied) await tx.transaction.update({
      where: { id: transactionId },
      // Allocation only: transaction remains pending and tax fields untouched.
      data: { category: evidence.category },
    })
    return suggestion
  })
}