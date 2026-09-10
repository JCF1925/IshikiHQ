export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const conditions = await prisma.healthCondition.findMany({
    where: { userId },
    include: {
      medications: { select: { id: true, name: true, strength: true, unit: true } },
      symptoms: { select: { id: true, name: true } },
      flares: { orderBy: { startDate: 'desc' } },
    },
    orderBy: [{ status: 'asc' }, { name: 'asc' }],
  })
  return NextResponse.json(conditions)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const b = await request.json()
  const condition = await prisma.healthCondition.create({
    data: {
      userId,
      name: b.name,
      icd10Code: b.icd10Code || null,
      diagnosedDate: b.diagnosedDate ? new Date(b.diagnosedDate) : null,
      status: b.status || 'active',
      notes: b.notes || null,
      ...(Array.isArray(b.medicationIds) && b.medicationIds.length
        ? { medications: { connect: b.medicationIds.map((id: string) => ({ id })) } }
        : {}),
    },
  })
  return NextResponse.json(condition, { status: 201 })
}
