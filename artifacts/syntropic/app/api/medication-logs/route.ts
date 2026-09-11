export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { medicationLogSchema, validationError } from '@/lib/medication-validation'
import { withMedicationStockTransaction } from '@/lib/medication-stock'

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const url = new URL(request.url)
  const scheduleId = url.searchParams.get('scheduleId')
  const medicationId = url.searchParams.get('medicationId')
  const dateStr = url.searchParams.get('date')

  const where: any = {
    userId,
    schedule: {
      userId,
      AND: [
        { OR: [{ prescriptionId: null }, { prescription: { userId } }] },
        { OR: [{ medicationId: null }, { medication: { userId } }] },
      ],
    },
  }
  if (scheduleId) where.scheduleId = scheduleId
  if (medicationId) {
    const medication = await prisma.medication.findFirst({ where: { id: medicationId, userId }, select: { id: true } })
    if (!medication) return NextResponse.json({ error: 'Medication was not found' }, { status: 404 })
    where.schedule = { ...where.schedule, OR: [{ medicationId }, { prescription: { medicationId, userId } }] }
  }
  if (dateStr) {
    const date = new Date(dateStr)
    if (Number.isNaN(date.getTime())) return NextResponse.json({ error: 'Invalid date query parameter' }, { status: 400 })
    const nextDay = new Date(date)
    nextDay.setDate(nextDay.getDate() + 1)
    where.takenAt = { gte: date, lt: nextDay }
  }

  const logs = await prisma.medicationLog.findMany({
    where,
    include: { schedule: { include: { prescription: { include: { medication: true } } } } },
    orderBy: { takenAt: 'desc' },
    take: 100,
  })
  return NextResponse.json(logs)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const parsed = medicationLogSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json(validationError(parsed.error), { status: 400 })
  const body = parsed.data
  const scheduleId = body.scheduleId

  const schedule = await prisma.dosageSchedule.findFirst({
    where: {
      id: scheduleId,
      userId,
      AND: [
        { OR: [{ prescriptionId: null }, { prescription: { userId } }] },
        { OR: [{ medicationId: null }, { medication: { userId } }] },
      ],
    },
    include: { prescription: true },
  })
  if (!schedule) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const dose = Number(body.doseTaken ?? schedule.doseAmount ?? '1')
  if (!body.skipped && (!Number.isFinite(dose) || dose <= 0)) return NextResponse.json({ error: 'doseTaken must be a positive number' }, { status: 400 })
  const medicationId = schedule.prescription?.medicationId ?? schedule.medicationId
  if (!medicationId) return NextResponse.json({ error: 'Schedule is not linked to a medication' }, { status: 400 })
  const createLog = async (tx: Prisma.TransactionClient) => {
    if (!body.skipped) {
      // Conditional update makes concurrent logging unable to take stock below zero.
      const updated = await tx.stockLevel.updateMany({ where: { userId, medicationId, currentQuantity: { gte: dose } }, data: { currentQuantity: { decrement: dose } } })
      if (!updated.count) throw new Error('INSUFFICIENT_STOCK')
      const stock = await tx.stockLevel.findFirst({ where: { userId, medicationId }, select: { currentQuantity: true } })
      await tx.stockTransaction.create({ data: { userId, medicationId, type: 'consume', quantityChange: -dose, balanceAfter: stock!.currentQuantity, notes: 'Dose logged' } })
    }
    return tx.medicationLog.create({
    data: {
      userId,
      medicationId,
      scheduleId,
      takenAt: body.takenAt ?? new Date(),
      doseTaken: body.skipped ? (body.doseTaken ?? null) : String(dose),
      skipped: body.skipped ?? false,
      skipReason: body.skipReason ?? null,
      symptomNote: body.symptomNote ?? null,
    }})
  }
  const log = await withMedicationStockTransaction(userId, medicationId, createLog)
    .catch(error => error instanceof Error && error.message === 'INSUFFICIENT_STOCK' ? null : Promise.reject(error))
  if (!log) return NextResponse.json({ error: 'Insufficient stock to log this dose' }, { status: 409 })

  return NextResponse.json(log, { status: 201 })
}
