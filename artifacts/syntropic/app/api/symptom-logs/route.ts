export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const url = new URL(request.url)
  const symptomId = url.searchParams.get('symptomId')
  const where: any = { userId }
  if (symptomId) where.symptomId = symptomId
  const logs = await prisma.symptomLog.findMany({
    where,
    include: { symptom: { select: { name: true } } },
    orderBy: { loggedAt: 'desc' },
    take: 200,
  })
  return NextResponse.json(logs)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const b = await request.json()
  const log = await prisma.symptomLog.create({
    data: {
      userId,
      symptomId: b.symptomId,
      severity: parseInt(b.severity),
      loggedAt: b.loggedAt ? new Date(b.loggedAt) : new Date(),
      triggers: Array.isArray(b.triggers) ? b.triggers : [],
      notes: b.notes || null,
      flareId: b.flareId || null,
    },
  })
  return NextResponse.json(log, { status: 201 })
}
