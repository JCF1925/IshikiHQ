export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const symptoms = await prisma.symptom.findMany({
    where: { userId },
    include: {
      logs: { orderBy: { loggedAt: 'desc' }, take: 60 },
      conditions: { select: { id: true, name: true } },
    },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(symptoms)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const b = await request.json()
  const symptom = await prisma.symptom.create({
    data: {
      userId,
      name: b.name,
      severityScale: b.severityScale ? parseInt(b.severityScale) : 10,
      ...(Array.isArray(b.conditionIds) && b.conditionIds.length
        ? { conditions: { connect: b.conditionIds.map((id: string) => ({ id })) } }
        : {}),
    },
  })
  return NextResponse.json(symptom, { status: 201 })
}
