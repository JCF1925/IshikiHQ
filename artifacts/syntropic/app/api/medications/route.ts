export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { medicationCreateSchema, validationError } from '@/lib/medication-validation'

const medInclude = {
  stockLevels: true,
  prescriptions: {
    select: { id: true, medicationId: true, datePrescribed: true, quantity: true, repeats: true, repeatsUsed: true, expiryDate: true, dosageSchedules: { where: { isActive: true } } },
    orderBy: { datePrescribed: 'desc' as const },
  },
  dosageSchedules: { where: { isActive: true }, orderBy: { startDate: 'desc' as const } },
  conditions: { select: { id: true, name: true, status: true } },
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id

  // Return product-level (parent) medications with their strength variants (children) nested.
  const medications = await prisma.medication.findMany({
    where: { userId, parentId: null },
    include: {
      ...medInclude,
      children: { include: medInclude, orderBy: { strength: 'asc' } },
    },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(medications.map(medication => ({
    ...medication,
    summary: `${medication.name}${medication.strength ? ` ${medication.strength}${medication.unit ? ` ${medication.unit}` : ''}` : ''}`,
  })))
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const parsed = medicationCreateSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json(validationError(parsed.error), { status: 400 })
  const body = parsed.data
  if (body.parentId) {
    const parent = await prisma.medication.findFirst({ where: { id: body.parentId, userId, parentId: null }, select: { id: true } })
    if (!parent) return NextResponse.json({ error: 'Parent medication was not found' }, { status: 404 })
  }

  const medication = await prisma.$transaction(async tx => {
    const created = await tx.medication.create({
    data: {
      userId,
      name: body.name,
      genericName: body.genericName ?? null,
      form: body.form ?? 'tablet',
      strength: body.strength ?? null,
      unit: body.unit ?? null,
      parentId: body.parentId ?? null,
      medType: body.medType ?? 'scheduled',
      isSchedule8: body.isSchedule8 ?? false,
      isOtc: body.isOtc ?? false,
      // monthly limit is a product-level field — only stored on the parent record
      monthlyLimit: body.parentId ? null : (body.monthlyLimit ?? null),
      notes: body.notes ?? null,
      isActive: body.isActive ?? true,
    },
    })
    await tx.stockLevel.create({
    data: {
      userId,
      medicationId: created.id, currentQuantity: body.initialStock ?? 0,
      reorderThreshold: body.reorderThreshold ?? 5,
    },
    })
    if ((body.initialStock ?? 0) > 0) await tx.stockTransaction.create({
      data: {
        userId,
        medicationId: created.id,
        type: 'stocktake',
        quantityChange: body.initialStock ?? 0,
        balanceAfter: body.initialStock ?? 0,
        countedQuantity: body.initialStock ?? 0,
        notes: 'Opening stock',
      },
    })
    return created
  })

  return NextResponse.json(medication, { status: 201 })
}
