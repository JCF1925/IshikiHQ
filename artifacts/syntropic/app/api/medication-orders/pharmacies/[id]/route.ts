import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { pharmacyUpdateSchema, validationError } from '@/lib/medication-validation'

export const dynamic = 'force-dynamic'

async function getUserId() {
  const session = await auth()
  return session?.user ? (session.user as any).id as string : null
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const parsed = pharmacyUpdateSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json(validationError(parsed.error), { status: 400 })

  const existing = await prisma.pharmacy.findFirst({ where: { id, userId }, select: { id: true } })
  if (!existing) return NextResponse.json({ error: 'Pharmacy was not found' }, { status: 404 })

  const pharmacy = await prisma.$transaction(async tx => {
    const updated = await tx.pharmacy.update({ where: { id }, data: parsed.data })
    if (parsed.data.isActive === false) {
      await tx.medicationPharmacyPreference.deleteMany({ where: { pharmacyId: id, userId } })
    }
    return updated
  })
  return NextResponse.json(pharmacy)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const pharmacy = await prisma.pharmacy.findFirst({
    where: { id, userId },
    select: { id: true, _count: { select: { orders: true } } },
  })
  if (!pharmacy) return NextResponse.json({ error: 'Pharmacy was not found' }, { status: 404 })

  if (pharmacy._count.orders > 0) {
    const archived = await prisma.$transaction(async tx => {
      const updated = await tx.pharmacy.update({ where: { id }, data: { isActive: false } })
      await tx.medicationPharmacyPreference.deleteMany({ where: { pharmacyId: id, userId } })
      return updated
    })
    return NextResponse.json({ ...archived, archived: true })
  }

  await prisma.pharmacy.delete({ where: { id } })
  return NextResponse.json({ ok: true, deleted: true })
}