export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { medicationLogSchema, validationError } from '@/lib/medication-validation'
import { withMedicationStockTransaction } from '@/lib/medication-stock'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params
  const parsed = medicationLogSchema.omit({ scheduleId: true }).partial().safeParse(await request.json())
  if (!parsed.success) return NextResponse.json(validationError(parsed.error), { status: 400 })
  const changes = parsed.data
  const located = await prisma.medicationLog.findFirst({
    where: { id, userId },
    include: { schedule: true },
  })
  if (!located) return NextResponse.json({ error: 'Dose log was not found' }, { status: 404 })
  const medicationId = located.medicationId
  const result = await withMedicationStockTransaction(userId, medicationId, async tx => {
    const current = await tx.medicationLog.findFirst({ where: { id, userId }, include: { schedule: true } })
    if (!current) return 'NOT_FOUND' as const
    const oldDose = current.skipped ? 0 : Number(current.doseTaken ?? current.schedule?.doseAmount)
    const nextSkipped = changes.skipped ?? current.skipped
    const nextDose = nextSkipped ? 0 : Number(changes.doseTaken ?? current.doseTaken ?? current.schedule?.doseAmount)
    if (!Number.isFinite(oldDose) || oldDose < 0 || !Number.isFinite(nextDose) || nextDose < 0) return 'INVALID_DOSE' as const
    const delta = oldDose - nextDose // positive means returning stock
    if (delta) {
      const adjusted = await tx.stockLevel.updateMany({
        where: { userId, medicationId: current.medicationId, ...(delta < 0 ? { currentQuantity: { gte: -delta } } : {}) },
        data: { currentQuantity: { increment: delta } },
      })
      if (!adjusted.count) return 'INSUFFICIENT_STOCK' as const
      const stock = await tx.stockLevel.findFirst({ where: { userId, medicationId: current.medicationId }, select: { currentQuantity: true } })
      await tx.stockTransaction.create({ data: { userId, medicationId: current.medicationId, type: 'adjustment', quantityChange: delta, balanceAfter: stock!.currentQuantity, notes: 'Dose log corrected' } })
    }
    await tx.medicationLog.update({ where: { id }, data: changes })
    return 'OK' as const
  })
  if (result === 'INSUFFICIENT_STOCK') return NextResponse.json({ error: 'Insufficient stock for the corrected dose' }, { status: 409 })
  if (result === 'INVALID_DOSE') return NextResponse.json({ error: 'Corrected dose must be a valid non-negative number' }, { status: 400 })
  return NextResponse.json({ ok: true })
}

// Logs are retained as clinical history; corrections should use PATCH rather than deletion.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params
  const log = await prisma.medicationLog.findFirst({ where: { id, userId }, select: { id: true } })
  if (!log) return NextResponse.json({ error: 'Dose log was not found' }, { status: 404 })
  return NextResponse.json({ error: 'Dose logs are retained for history. Correct the log with PATCH instead.' }, { status: 409 })
}