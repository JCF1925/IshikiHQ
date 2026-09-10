export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { prescriptionCreateSchema, validationError, withoutPrescriptionToken } from '@/lib/medication-validation'

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const url = new URL(request.url)
  const medicationId = url.searchParams.get('medicationId')
  const where: any = { userId }
  if (medicationId) {
    const medication = await prisma.medication.findFirst({ where: { id: medicationId, userId }, select: { id: true } })
    if (!medication) return NextResponse.json({ error: 'Medication was not found' }, { status: 404 })
    where.medicationId = medicationId
  }
  const prescriptions = await prisma.prescription.findMany({
    where,
    include: {
      medication: { select: { id: true, name: true, strength: true, unit: true, form: true } },
      prescriber: { select: { id: true, name: true, organisation: { select: { name: true } } } },
      dosageSchedules: { orderBy: { startDate: 'desc' } },
    },
    orderBy: { datePrescribed: 'desc' },
  })
  return NextResponse.json(prescriptions.map(withoutPrescriptionToken))
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const parsed = prescriptionCreateSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json(validationError(parsed.error), { status: 400 })
  const b = parsed.data
  const medication = await prisma.medication.findFirst({ where: { id: b.medicationId, userId }, select: { isSchedule8: true } })
  if (!medication) return NextResponse.json({ error: 'Medication was not found' }, { status: 404 })
  if (b.prescriberId) {
    const prescriber = await prisma.person.findFirst({ where: { id: b.prescriberId, userId }, select: { id: true } })
    if (!prescriber) return NextResponse.json({ error: 'Prescriber was not found' }, { status: 404 })
  }

  const datePrescribed = b.datePrescribed ? new Date(b.datePrescribed) : new Date()
  // Auto-calculate expiry when not supplied: Schedule 8 scripts expire in 6 months, others 12.
  let expiryDate: Date | null = b.expiryDate ? new Date(b.expiryDate) : null
  if (!expiryDate) {
    const months = medication.isSchedule8 ? 6 : 12
    expiryDate = new Date(datePrescribed)
    expiryDate.setMonth(expiryDate.getMonth() + months)
  }

  const prescription = await prisma.prescription.create({
    data: {
      userId,
      medicationId: b.medicationId,
      prescriberId: b.prescriberId || null,
      datePrescribed,
      quantity: b.quantity ?? null,
      repeats: b.repeats ?? 0,
      repeatsUsed: b.repeatsUsed ?? 0,
      pbsItemCode: b.pbsItemCode || null,
      cost: b.cost ?? 0,
      expiryDate,
      escriptToken: b.escriptToken || null,
      notes: b.notes || null,
    },
  })
  return NextResponse.json(withoutPrescriptionToken(prescription), { status: 201 })
}
