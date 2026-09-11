export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { stockReconciliationSchema, stockUpdateSchema, validationError } from '@/lib/medication-validation'
import {
  formatHistoricalStockMismatchResolutionNote,
  getMedicationStockDiagnostic,
  summarizeStockLedger,
  withMedicationStockTransaction,
} from '@/lib/medication-stock'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id

  const stocks = await prisma.$transaction(async tx => {
    const levels = await tx.stockLevel.findMany({
      where: { userId },
      include: { medication: true },
    })
    const transactions = await tx.stockTransaction.findMany({
      where: { userId, medicationId: { in: levels.map(level => level.medicationId) } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, medicationId: true, date: true, quantityChange: true, balanceAfter: true, notes: true, auditKind: true },
    })
    const entriesByMedication = new Map<string, {
      id: string
      date: Date
      quantityChange: number
      balanceAfter: number
      notes: string | null
      auditKind: 'reconciliation' | 'mismatch_resolution' | null
    }[]>()
    for (const transaction of transactions) {
      const entries = entriesByMedication.get(transaction.medicationId) ?? []
      entries.push(transaction)
      entriesByMedication.set(transaction.medicationId, entries)
    }
    return levels.map(level => ({
      ...level,
      ...summarizeStockLedger(level.currentQuantity, entriesByMedication.get(level.medicationId) ?? []),
    }))
  })
  return NextResponse.json(stocks)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const parsed = stockReconciliationSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json(validationError(parsed.error), { status: 400 })
  const body = parsed.data

  const existing = await prisma.stockLevel.findFirst({
    where: { id: body.id, userId },
    select: { medicationId: true },
  })
  if (!existing) return NextResponse.json({ error: 'Stock level was not found' }, { status: 404 })

  const result = await withMedicationStockTransaction(userId, existing.medicationId, async tx => {
    const diagnostic = await getMedicationStockDiagnostic(tx, userId, existing.medicationId)
    if (!diagnostic) return { kind: 'not_found' as const }
    if (body.action === 'resolve_mismatch') {
      const mismatch = diagnostic.historicalMismatches.find(entry => entry.id === body.mismatchId)
      if (!mismatch) return { kind: 'mismatch_not_found' as const }
      if (mismatch.resolution) return { kind: 'already_resolved' as const, diagnostic }
      if (
        Math.abs(mismatch.recordedBalanceAfter - body.expectedRecordedBalance) > 0.0000001
        || Math.abs(mismatch.ledgerBalance - body.expectedLedgerBalance) > 0.0000001
      ) {
        return { kind: 'stale' as const, diagnostic }
      }
      const resolution = await tx.stockTransaction.create({
        data: {
          userId,
          medicationId: existing.medicationId,
          type: 'adjustment',
          quantityChange: 0,
          balanceAfter: diagnostic.currentQuantity,
          auditKind: 'mismatch_resolution',
          notes: formatHistoricalStockMismatchResolutionNote({
            mismatchId: mismatch.id,
            beforeRecordedBalance: mismatch.recordedBalanceAfter,
            afterLedgerBalance: mismatch.ledgerBalance,
            reason: body.reason,
          }),
        },
      })
      const resolvedDiagnostic = await getMedicationStockDiagnostic(tx, userId, existing.medicationId)
      return {
        kind: 'resolved' as const,
        diagnostic: resolvedDiagnostic,
        resolution,
      }
    }
    if (
      Math.abs(diagnostic.currentQuantity - body.expectedCurrentQuantity) > 0.0000001
      || Math.abs(diagnostic.ledgerQuantity - body.expectedLedgerQuantity) > 0.0000001
    ) {
      return { kind: 'stale' as const, diagnostic }
    }
    if (diagnostic.hasHistoricalInconsistency) return { kind: 'history_inconsistent' as const, diagnostic }
    if (!diagnostic.hasMismatch) return { kind: 'already_reconciled' as const, diagnostic }

    const updated = await tx.stockLevel.update({
      where: { userId_medicationId: { userId, medicationId: existing.medicationId } },
      data: { currentQuantity: diagnostic.ledgerQuantity },
    })
    const transaction = await tx.stockTransaction.create({
      data: {
        userId,
        medicationId: existing.medicationId,
        type: 'adjustment',
        quantityChange: diagnostic.mismatchQuantity,
        balanceAfter: diagnostic.ledgerQuantity,
        auditKind: 'reconciliation',
        notes: `Historical stock reconciliation: current stock ${diagnostic.currentQuantity} aligned to ledger balance ${diagnostic.ledgerQuantity}.`,
      },
    })
    return {
      kind: 'reconciled' as const,
      diagnostic: {
        ...diagnostic,
        currentQuantity: diagnostic.ledgerQuantity,
        transactionCount: diagnostic.transactionCount + 1,
        mismatchQuantity: 0,
        hasMismatch: false,
      },
      stock: updated,
      transaction,
    }
  })

  if (result.kind === 'not_found') return NextResponse.json({ error: 'Stock level was not found' }, { status: 404 })
  if (result.kind === 'mismatch_not_found') return NextResponse.json({ error: 'Historical stock mismatch was not found' }, { status: 404 })
  if (result.kind === 'already_resolved') return NextResponse.json({ error: 'Historical stock mismatch was already resolved', diagnostic: result.diagnostic }, { status: 409 })
  if (result.kind === 'stale') return NextResponse.json({ error: 'Stock changed while it was being reviewed', diagnostic: result.diagnostic }, { status: 409 })
  if (result.kind === 'history_inconsistent') {
    return NextResponse.json({
      error: 'Stock history needs review before it can be reconciled',
      diagnostic: result.diagnostic,
    }, { status: 409 })
  }
  if (result.kind === 'already_reconciled') return NextResponse.json({ error: 'Stock is already reconciled', diagnostic: result.diagnostic }, { status: 409 })
  if (result.kind === 'resolved') return NextResponse.json(result)
  return NextResponse.json(result)
}

export async function PUT(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const parsed = stockUpdateSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json(validationError(parsed.error), { status: 400 })
  const body = parsed.data

  const existing = await prisma.stockLevel.findFirst({ where: { id: body.id, userId }, select: { medicationId: true } })
  if (!existing) return NextResponse.json({ error: 'Stock level was not found' }, { status: 404 })
  const stock = await withMedicationStockTransaction(userId, existing.medicationId, async tx => {
    const current = await tx.stockLevel.findFirst({ where: { id: body.id, userId } })
    if (!current) return null
    const updated = await tx.stockLevel.update({
      where: { id: current.id },
      data: {
        ...(body.currentQuantity != null ? { currentQuantity: body.currentQuantity } : {}),
        ...(body.reorderThreshold != null ? { reorderThreshold: body.reorderThreshold } : {}),
        ...(body.monthlyLimit !== undefined ? { monthlyLimit: body.monthlyLimit } : {}),
      },
    })
    if (body.currentQuantity != null && body.currentQuantity !== current.currentQuantity) {
      await tx.stockTransaction.create({
        data: { userId, medicationId: current.medicationId, type: 'adjustment', quantityChange: body.currentQuantity - current.currentQuantity, balanceAfter: body.currentQuantity, notes: 'Stock level corrected' },
      })
    }
    return updated
  })
  if (!stock) return NextResponse.json({ error: 'Stock level was not found' }, { status: 404 })
  return NextResponse.json(stock)
}
