export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

function num(v: any, d = 0): number { const n = parseFloat(v); return isNaN(n) ? d : n }

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params
  const b = await request.json()
  const plan = await prisma.financialPlan.findFirst({ where: { id, userId } })
  if (!plan) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const event = await prisma.planEvent.create({
    data: {
      userId,
      planId: id,
      label: b.label || 'Event',
      year: b.year ? parseInt(b.year) : plan.startYear,
      kind: b.kind || 'expense',
      amount: num(b.amount),
      isDebtFunded: !!b.isDebtFunded,
      isRecurring: !!b.isRecurring,
      endYear: b.endYear ? parseInt(b.endYear) : null,
      notes: b.notes || null,
    },
  })
  return NextResponse.json(event, { status: 201 })
}

export async function DELETE(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { searchParams } = new URL(request.url)
  const eventId = searchParams.get('eventId')
  if (!eventId) return NextResponse.json({ error: 'eventId required' }, { status: 400 })
  const existing = await prisma.planEvent.findFirst({ where: { id: eventId, userId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await prisma.planEvent.delete({ where: { id: eventId } })
  return NextResponse.json({ ok: true })
}
