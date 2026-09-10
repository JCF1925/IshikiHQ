import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { withMedicationStockTransaction } from '@/lib/medication-stock'
import { pharmacyOrderActionSchema, validationError } from '@/lib/medication-validation'

const transitions: Record<string, string[]> = { draft: ['confirmed', 'cancelled'], confirmed: ['placed', 'cancelled'], placed: ['received', 'cancelled'], received: [], cancelled: [] }

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id; const { id } = await params
  const parsed = pharmacyOrderActionSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json(validationError(parsed.error), { status: 400 })
  const body = parsed.data
  if (body.lines?.some(line => line.status === 'received')) {
    return NextResponse.json({ error: 'Received lines cannot be edited through the order workflow' }, { status: 400 })
  }
  const order = await prisma.pharmacyOrder.findFirst({ where: { id, userId }, include: { lines: true } })
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (body.action === 'update' && order.status !== 'draft') return NextResponse.json({ error: 'Only draft orders can be edited' }, { status: 409 })
  const target = body.action === 'confirm' ? 'confirmed' : body.action === 'place' ? 'placed' : body.action === 'cancel' ? 'cancelled' : body.action === 'receive' ? 'received' : order.status
  if (target !== order.status && !transitions[order.status]?.includes(target)) return NextResponse.json({ error: `Cannot move ${order.status} to ${target}` }, { status: 409 })
  if (body.action === 'receive') {
    for (const line of order.lines.filter(l => l.status !== 'cancelled')) {
      await withMedicationStockTransaction(userId, line.medicationId, async tx => {
        const persisted = await tx.pharmacyOrderLine.findUnique({ where: { id: line.id }, select: { status: true, receivedAt: true } })
        if (!persisted || persisted.receivedAt || persisted.status === 'received') return
        const stock = await tx.stockLevel.findUnique({ where: { userId_medicationId: { userId, medicationId: line.medicationId } } })
        if (!stock) throw new Error('STOCK_NOT_FOUND')
        const next = stock.currentQuantity + line.quantity
        await tx.stockLevel.update({ where: { id: stock.id }, data: { currentQuantity: next, lastDispensed: new Date() } })
        await tx.stockTransaction.create({ data: { userId, medicationId: line.medicationId, type: 'dispense', quantityChange: line.quantity, balanceAfter: next, notes: `Received pharmacy order ${id}` } })
        if (line.prescriptionId) {
          const script = await tx.prescription.findFirst({ where: { id: line.prescriptionId, userId, medicationId: line.medicationId } })
          if (!script || (script.expiryDate && script.expiryDate < new Date()) || script.repeatsUsed >= script.repeats + 1) throw new Error('PRESCRIPTION_UNAVAILABLE')
          await tx.prescription.update({ where: { id: script.id }, data: { repeatsUsed: { increment: 1 } } })
        }
        await tx.pharmacyOrderLine.update({ where: { id: line.id }, data: { status: persisted.status === 'substituted' ? 'substituted' : 'received', receivedAt: new Date() } })
      })
    }
  }
  const updated = await prisma.$transaction(async tx => {
    const current = await tx.pharmacyOrder.findFirst({ where: { id, userId } }); if (!current) throw new Error('NOT_FOUND')
    await tx.pharmacyOrder.update({ where: { id }, data: { status: target, notes: body.notes === undefined ? current.notes : body.notes } })
    await tx.pharmacyOrderEvent.create({ data: { userId, orderId: id, fromStatus: current.status, toStatus: target, details: { action: body.action } } })
    if (body.lines) {
      if (body.lines.some(line => line.status === 'received')) throw new Error('INVALID_LINE')
      for (const line of body.lines) await tx.pharmacyOrderLine.updateMany({ where: { orderId: id, medicationId: line.medicationId }, data: { quantity: line.quantity, status: line.status ?? 'ordered', substitutionNote: line.substitutionNote ?? null } })
    }
    return tx.pharmacyOrder.findUnique({ where: { id }, include: { lines: true, events: { orderBy: { createdAt: 'asc' } } } })
  })
  return NextResponse.json(updated)
}