export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { medicationUpdateSchema, validationError, withoutPrescriptionToken } from '@/lib/medication-validation'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params

  const medication = await prisma.medication.findFirst({
    where: { id, userId },
    include: {
      stockLevels: true,
      prescriptions: {
        select: { id: true, userId: true, medicationId: true, prescriberId: true, datePrescribed: true, quantity: true, repeats: true, repeatsUsed: true, pbsItemCode: true, cost: true, expiryDate: true, notes: true, createdAt: true, updatedAt: true, escriptToken: true, dosageSchedules: true, prescriber: true },
        orderBy: { datePrescribed: 'desc' },
      },
      children: true,
    },
  })
  if (!medication) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ...medication, prescriptions: medication.prescriptions.map(withoutPrescriptionToken) })
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params
  const parsed = medicationUpdateSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json(validationError(parsed.error), { status: 400 })
  const data = parsed.data
  if ('monthlyLimit' in data && id) {
    const existing = await prisma.medication.findFirst({ where: { id, userId }, select: { parentId: true } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (existing.parentId) return NextResponse.json({ error: 'Monthly limit belongs to the parent medication' }, { status: 400 })
  }

  const medication = await prisma.medication.updateMany({
    where: { id, userId },
    data,
  })
  if (!medication.count) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params

  const medication = await prisma.medication.findFirst({
    where: { id, userId },
    select: { _count: { select: { prescriptions: true, dosageSchedules: true, stockTransactions: true, children: true } } },
  })
  if (!medication) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (Object.values(medication._count).some(Boolean)) {
    return NextResponse.json({ error: 'Medication has history or variants and cannot be deleted. Archive it by setting isActive to false.' }, { status: 409 })
  }
  await prisma.medication.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
