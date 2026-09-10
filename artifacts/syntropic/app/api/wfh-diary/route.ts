export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { fyBounds, CURRENT_FY } from '@/lib/tax'

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const url = new URL(request.url)
  const fy = url.searchParams.get('fy') || CURRENT_FY
  const { start, end } = fyBounds(fy)
  const items = await prisma.wfhDiaryEntry.findMany({
    where: { userId, date: { gte: start, lte: end } },
    orderBy: { date: 'desc' },
  })
  const totalHours = items.reduce((s, e) => s + (e.hours || 0), 0)
  return NextResponse.json({ entries: items, totalHours: Math.round(totalHours * 100) / 100, fy })
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const body = await request.json()
  const item = await prisma.wfhDiaryEntry.create({
    data: {
      userId,
      date: body.date ? new Date(body.date) : new Date(),
      hours: parseFloat(body.hours) || 0,
      notes: body.notes || null,
    },
  })
  return NextResponse.json(item, { status: 201 })
}
