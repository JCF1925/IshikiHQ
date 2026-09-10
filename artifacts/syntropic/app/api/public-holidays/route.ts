export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const items = await prisma.publicHoliday.findMany({ where: { userId }, orderBy: { date: 'desc' } })
  return NextResponse.json(items)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const body = await request.json()
  const item = await prisma.publicHoliday.create({
    data: {
      userId,
      date: body.date ? new Date(body.date) : new Date(),
      name: body.name || 'Public holiday',
      region: body.region || null,
    },
  })
  return NextResponse.json(item, { status: 201 })
}
