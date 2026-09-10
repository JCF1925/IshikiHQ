import { createHash } from 'node:crypto'
import { prisma } from '@/lib/db'
import { aggregateSnapshotKey, normalizeMerchant } from '@/lib/automation-beta'

export async function rebuildFinancialAggregates(userId: string, periodStart: Date, periodEnd: Date) {
  const transactions = await prisma.transaction.findMany({
    where: { userId, date: { gte: periodStart, lt: periodEnd } },
    include: { sourceTransactions: { orderBy: { receivedAt: 'desc' }, take: 1 } },
    orderBy: { id: 'asc' },
  })
  const dimensions = new Map<string, { dimension: string; value: string; ids: string[]; total: number }>()
  for (const transaction of transactions) {
    const values = [
      ['period', 'all'],
      ['merchant', normalizeMerchant(transaction.merchant || transaction.description) || 'unknown'],
      ['category', transaction.category || 'uncategorised'],
    ]
    for (const [dimension, value] of values) {
      const key = aggregateSnapshotKey(dimension as any, value, periodStart, periodEnd)
      const row = dimensions.get(key) ?? { dimension, value, ids: [], total: 0 }
      row.ids.push(transaction.id)
      row.total += transaction.amount
      dimensions.set(key, row)
    }
  }
  const existingSnapshots = await prisma.financialAggregateSnapshot.findMany({
    where: { userId, periodStart, periodEnd },
    select: { id: true, dimension: true, dimensionValue: true },
  })
  const liveDimensionKeys = new Set([...dimensions.values()].map((row) => `${row.dimension}\0${row.value}`))
  const obsoleteIds = existingSnapshots
    .filter((row) => !liveDimensionKeys.has(`${row.dimension}\0${row.dimensionValue}`))
    .map((row) => row.id)
  if (obsoleteIds.length) await prisma.financialAggregateSnapshot.deleteMany({ where: { id: { in: obsoleteIds } } })
  for (const row of dimensions.values()) {
    const contributing = transactions.filter((item) => row.ids.includes(item.id))
    const version = createHash('sha256').update(JSON.stringify(contributing.map((item) => [
      item.id, item.updatedAt.toISOString(), item.amount, item.category, item.merchant,
      item.sourceTransactions[0]?.id ?? null,
    ]))).digest('hex')
    await prisma.$transaction(async (tx) => {
      const snapshot = await tx.financialAggregateSnapshot.upsert({
        where: { userId_dimension_dimensionValue_periodStart_periodEnd: {
          userId, dimension: row.dimension, dimensionValue: row.value, periodStart, periodEnd,
        } },
        create: {
          userId, dimension: row.dimension, dimensionValue: row.value, periodStart, periodEnd,
          sourceVersion: version, transactionCount: row.ids.length, totalAmount: row.total,
        },
        update: { sourceVersion: version, transactionCount: row.ids.length, totalAmount: row.total },
      })
      await tx.financialAggregateSource.deleteMany({ where: { snapshotId: snapshot.id } })
      if (row.ids.length) {
        await tx.financialAggregateSource.createMany({
          data: contributing.map((item) => ({
            snapshotId: snapshot.id, transactionId: item.id,
            sourceTransactionId: item.sourceTransactions[0]?.id ?? null,
          })),
        })
      }
    })
  }
  return dimensions.size
}