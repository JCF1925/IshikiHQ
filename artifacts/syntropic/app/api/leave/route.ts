export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const items = await prisma.leaveEntry.findMany({ where: { userId }, orderBy: { startDate: 'desc' } })
  return NextResponse.json(items)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const body = await request.json()
  const item = await prisma.leaveEntry.create({
    data: {
      userId,
      startDate: body.startDate ? new Date(body.startDate) : new Date(),
      endDate: body.endDate ? new Date(body.endDate) : (body.startDate ? new Date(body.startDate) : new Date()),
      leaveType: body.leaveType || 'annual',
      hoursPerDay: body.hoursPerDay != null && body.hoursPerDay !== '' ? parseFloat(body.hoursPerDay) : null,
      notes: body.notes || null,
    },
  })
  return NextResponse.json(item, { status: 201 })
}
