export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const logs = await prisma.moodLog.findMany({ where: { userId }, orderBy: { loggedAt: 'desc' }, take: 120 })
  return NextResponse.json(logs)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const b = await request.json()
  const log = await prisma.moodLog.create({
    data: {
      userId,
      mood: parseInt(b.mood),
      energy: parseInt(b.energy),
      anxiety: b.anxiety != null && b.anxiety !== '' ? parseInt(b.anxiety) : null,
      questionnaire: b.questionnaire || null,
      score: b.score != null && b.score !== '' ? parseInt(b.score) : null,
      journal: b.journal || null,
      notes: b.notes || null,
      loggedAt: b.loggedAt ? new Date(b.loggedAt) : new Date(),
    },
  })
  return NextResponse.json(log, { status: 201 })
}
