export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

const num = (v: any) => (v != null && v !== '' ? parseFloat(v) : null)

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const logs = await prisma.nutritionLog.findMany({ where: { userId }, orderBy: { loggedAt: 'desc' }, take: 120 })
  return NextResponse.json(logs)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const b = await request.json()
  const log = await prisma.nutritionLog.create({
    data: {
      userId,
      mealType: b.mealType || null,
      description: b.description,
      kilojoules: num(b.kilojoules),
      protein: num(b.protein),
      carbs: num(b.carbs),
      fat: num(b.fat),
      hydrationMl: num(b.hydrationMl),
      notes: b.notes || null,
      loggedAt: b.loggedAt ? new Date(b.loggedAt) : new Date(),
    },
  })
  return NextResponse.json(log, { status: 201 })
}
