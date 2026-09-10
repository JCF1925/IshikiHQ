export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { prescriptionUpdateSchema, validationError, withoutPrescriptionToken } from '@/lib/medication-validation'
import { withMedicationStockTransaction } from '@/lib/medication-stock'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params
  const parsed = prescriptionUpdateSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json(validationError(parsed.error), { status: 400 })
  const b = parsed.data
  const owned = await prisma.prescription.findFirst({ where: { id, userId } })
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // dispense a repeat
  if (b.action === 'dispense') {
    let dispenseFailure: 'EXPIRED' | 'NO_FILLS' | null = null
    const updated = await withMedicationStockTransaction(userId, owned.medicationId, async tx => {
      const current = await tx.prescription.findFirst({ where: { id, userId } })
      if (!current) throw new Error('NO_FILLS')
      if (current.expiryDate && current.expiryDate <= new Date()) throw new Error('EXPIRED')
      // repeats excludes the initial fill.  updateMany makes the increment
      // conditional even if this transaction is retried after contention.
      const incremented = await tx.prescription.updateMany({
        where: { id, userId, repeatsUsed: { lt: current.repeats + 1 } },
        data: { repeatsUsed: { increment: 1 } },
      })
      if (!incremented.count) throw new Error('NO_FILLS')
      const result = await tx.prescription.findUniqueOrThrow({ where: { id } })
      if (current.quantity) {
        const stock = await tx.stockLevel.upsert({
          where: { userId_medicationId: { userId, medicationId: current.medicationId } },
          create: { userId, medicationId: current.medicationId, currentQuantity: current.quantity, lastDispensed: new Date() },
          update: { currentQuantity: { increment: current.quantity }, lastDispensed: new Date() },
        })
        await tx.stockTransaction.create({
        data: {
          userId,
          medicationId: current.medicationId,
          type: 'dispense',
          quantityChange: current.quantity, balanceAfter: stock.currentQuantity,
          notes: 'Dispensed from script',
        },
        })
      }
      return result
    }).catch(error => {
      if (error instanceof Error && (error.message === 'EXPIRED' || error.message === 'NO_FILLS')) {
        dispenseFailure = error.message
        return null
      }
      throw error
    })
    if (!updated) {
      if (dispenseFailure === 'EXPIRED') {
        return NextResponse.json({ error: 'Prescription has expired' }, { status: 400 })
      }
      return NextResponse.json({ error: 'No fills remaining' }, { status: 400 })
    }
    return NextResponse.json(withoutPrescriptionToken(updated))
  }

  const data = { ...b }
  delete data.action
  const resultingRepeats = data.repeats ?? owned.repeats
  const resultingFillsUsed = data.repeatsUsed ?? owned.repeatsUsed
  if (resultingFillsUsed > resultingRepeats + 1) {
    return NextResponse.json({ error: 'Fills used cannot exceed initial fill plus repeats' }, { status: 400 })
  }
  if (data.prescriberId) {
    const prescriber = await prisma.person.findFirst({ where: { id: data.prescriberId, userId }, select: { id: true } })
    if (!prescriber) return NextResponse.json({ error: 'Prescriber was not found' }, { status: 404 })
  }

  const updated = await prisma.prescription.update({ where: { id }, data })
  return NextResponse.json(withoutPrescriptionToken(updated))
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params
  const owned = await prisma.prescription.findFirst({ where: { id, userId }, select: { _count: { select: { dosageSchedules: true } } } })
  if (!owned) return NextResponse.json({ error: 'Prescription was not found' }, { status: 404 })
  if (owned._count.dosageSchedules) return NextResponse.json({ error: 'Prescription has dosage history and cannot be deleted' }, { status: 409 })
  await prisma.prescription.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
