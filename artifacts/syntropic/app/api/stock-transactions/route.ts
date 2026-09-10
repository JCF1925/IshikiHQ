export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { stockTransactionSchema, validationError } from '@/lib/medication-validation'
import { withMedicationStockTransaction } from '@/lib/medication-stock'

// GET ?medicationId=... -> ledger (desc by date) for one medication, or all for user
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { searchParams } = new URL(request.url)
  const medicationId = searchParams.get('medicationId')

  if (medicationId) {
    const medication = await prisma.medication.findFirst({ where: { id: medicationId, userId }, select: { id: true } })
    if (!medication) return NextResponse.json({ error: 'Medication was not found' }, { status: 404 })
  }
  const txns = await prisma.stockTransaction.findMany({
    where: { userId, ...(medicationId ? { medicationId } : {}) },
    orderBy: { date: 'desc' },
    include: { medication: { select: { id: true, name: true, strength: true } } },
  })
  return NextResponse.json(txns)
}

// POST -> record a stock transaction and update the StockLevel balance
// body: { medicationId, type, quantityChange?, countedQuantity?, notes?, date? }
// - stocktake: provide countedQuantity; quantityChange computed as (counted - current)
// - dispense/consume/adjustment/dispose: provide signed quantityChange
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const parsed = stockTransactionSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json(validationError(parsed.error), { status: 400 })
  const body = parsed.data
  const { medicationId, type } = body
  const medication = await prisma.medication.findFirst({ where: { id: medicationId, userId }, select: { id: true } })
  if (!medication) return NextResponse.json({ error: 'Medication was not found' }, { status: 404 })
  const txn = await withMedicationStockTransaction(userId, medicationId, async tx => {
    let stock = await tx.stockLevel.findFirst({ where: { userId, medicationId } })
    if (!stock) stock = await tx.stockLevel.create({ data: { userId, medicationId, currentQuantity: 0 } })
    const current = stock.currentQuantity
    const countedQuantity = type === 'stocktake' ? (body.countedQuantity ?? 0) : null
    const quantityChange = type === 'stocktake' ? (countedQuantity ?? 0) - current : body.quantityChange!
    const balanceAfter = current + quantityChange
    if (balanceAfter < 0) throw new Error('INSUFFICIENT_STOCK')
    await tx.stockLevel.update({ where: { id: stock.id }, data: { currentQuantity: balanceAfter, ...(type === 'dispense' ? { lastDispensed: new Date() } : {}) } })
    return tx.stockTransaction.create({
    data: {
      userId,
      medicationId,
      type,
      quantityChange,
      balanceAfter,
      countedQuantity,
      notes: body.notes || null,
      ...(body.date ? { date: body.date } : {}),
    },
    })
  }).catch(error => error instanceof Error && error.message === 'INSUFFICIENT_STOCK' ? null : Promise.reject(error))
  if (!txn) return NextResponse.json({ error: 'Stock cannot be reduced below zero' }, { status: 409 })

  return NextResponse.json(txn)
}
