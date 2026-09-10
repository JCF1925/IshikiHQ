export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const types = await prisma.vitalType.findMany({
    where: { userId },
    include: { logs: { orderBy: { loggedAt: 'desc' }, take: 60 } },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(types)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const b = await request.json()
  const type = await prisma.vitalType.upsert({
    where: { userId_name: { userId, name: b.name } },
    update: {
      unit: b.unit || '',
      normalRangeLow: b.normalRangeLow != null && b.normalRangeLow !== '' ? parseFloat(b.normalRangeLow) : null,
      normalRangeHigh: b.normalRangeHigh != null && b.normalRangeHigh !== '' ? parseFloat(b.normalRangeHigh) : null,
    },
    create: {
      userId,
      name: b.name,
      unit: b.unit || '',
      normalRangeLow: b.normalRangeLow != null && b.normalRangeLow !== '' ? parseFloat(b.normalRangeLow) : null,
      normalRangeHigh: b.normalRangeHigh != null && b.normalRangeHigh !== '' ? parseFloat(b.normalRangeHigh) : null,
    },
  })
  return NextResponse.json(type, { status: 201 })
}
