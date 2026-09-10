export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { scheduleCreateSchema, validationError } from '@/lib/medication-validation'

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const url = new URL(request.url)
  const prescriptionId = url.searchParams.get('prescriptionId')
  const medicationId = url.searchParams.get('medicationId')
  if (medicationId) {
    const medication = await prisma.medication.findFirst({ where: { id: medicationId, userId }, select: { id: true } })
    if (!medication) return NextResponse.json({ error: 'Medication was not found' }, { status: 404 })
  }
  const where: any = {
    userId,
    AND: [
      { OR: [{ prescriptionId: null }, { prescription: { userId } }] },
      { OR: [{ medicationId: null }, { medication: { userId } }] },
    ],
  }
  if (prescriptionId) where.prescriptionId = prescriptionId
  // A schedule can belong directly to an OTC medication or indirectly via a
  // prescription. Both forms are part of the medication's schedule history.
  if (medicationId) where.AND.push({ OR: [{ medicationId }, { prescription: { medicationId, userId } }] })
  const schedules = await prisma.dosageSchedule.findMany({
    where,
    include: { prescription: { include: { medication: { select: { name: true, strength: true, unit: true } } } } },
    orderBy: { startDate: 'desc' },
  })
  const now = new Date()
  return NextResponse.json(schedules.map(schedule => ({
    ...schedule,
    // Historical/archived rows remain visible, but a past end date is never
    // presented as active if an older row was not explicitly archived.
    isActive: schedule.isActive && (!schedule.endDate || schedule.endDate >= now),
  })))
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const raw = await request.json()
  // Forms submit empty optional relationship fields as ''. Treat them as absent.
  const parsed = scheduleCreateSchema.safeParse({ ...raw, prescriptionId: raw.prescriptionId || null, medicationId: raw.medicationId || null })
  if (!parsed.success) return NextResponse.json(validationError(parsed.error), { status: 400 })
  const b = parsed.data
  const prescriptionId = b.prescriptionId ?? null
  const medicationId = b.medicationId ?? null

  const [prescription, medication] = await Promise.all([
    prescriptionId
      ? prisma.prescription.findFirst({ where: { id: prescriptionId, userId }, select: { id: true } })
      : null,
    medicationId
      ? prisma.medication.findFirst({ where: { id: medicationId, userId }, select: { id: true } })
      : null,
  ])
  if ((prescriptionId && !prescription) || (medicationId && !medication)) {
    return NextResponse.json({ error: 'The selected prescription or medication was not found' }, { status: 404 })
  }
  if (prescription && medicationId) {
    const prescriptionMedication = await prisma.prescription.findFirst({ where: { id: prescription.id, userId }, select: { medicationId: true } })
    if (prescriptionMedication?.medicationId !== medicationId) return NextResponse.json({ error: 'Medication must match the selected prescription' }, { status: 400 })
  }

  const schedule = await prisma.$transaction(async tx => {
  // effective-dating: when superseding, close off the currently-active schedule for this script/med
  if (b.supersede) {
    const effective = b.startDate ? new Date(b.startDate) : new Date()
    const prevEnd = new Date(effective.getTime() - 86400000)
    const supWhere: any = { userId, isActive: true }
    if (prescriptionId) supWhere.prescriptionId = prescriptionId
    else supWhere.medicationId = medicationId
    await tx.dosageSchedule.updateMany({
      where: supWhere,
      data: { isActive: false, endDate: prevEnd },
    })
  }
  return tx.dosageSchedule.create({
    data: {
      userId,
      prescriptionId,
      medicationId,
      frequency: b.frequency ?? 'daily',
      times: b.times ?? [],
      doseAmount: String(b.doseAmount ?? '1'),
      presetSlot: b.presetSlot ?? null, startDate: b.startDate ?? new Date(), endDate: b.endDate ?? null,
      withFood: !!b.withFood,
      notes: b.notes ?? null,
      isActive: b.isActive ?? true,
    },
  })
  })
  return NextResponse.json(schedule, { status: 201 })
}
