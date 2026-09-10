export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const items = await prisma.wfhPattern.findMany({
    where: { userId },
    orderBy: [{ isActive: 'desc' }, { startDate: 'desc' }],
  })
  return NextResponse.json(items)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const body = await request.json()
  const item = await prisma.wfhPattern.create({
    data: {
      userId,
      dayOfWeek: Array.isArray(body.dayOfWeek) ? body.dayOfWeek.map((d: any) => parseInt(d, 10)) : [],
      hours: body.hours != null && body.hours !== '' ? parseFloat(body.hours) : 7.6,
      startDate: body.startDate ? new Date(body.startDate) : new Date(),
      endDate: body.endDate ? new Date(body.endDate) : null,
      isActive: body.isActive ?? true,
      notes: body.notes || null,
    },
  })
  return NextResponse.json(item, { status: 201 })
}
