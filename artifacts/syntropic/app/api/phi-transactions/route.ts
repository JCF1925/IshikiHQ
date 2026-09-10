export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { searchParams } = new URL(request.url)
  const policyId = searchParams.get('policyId')
  const txns = await prisma.phiTransaction.findMany({
    where: { userId, ...(policyId ? { policyId } : {}) },
    orderBy: { date: 'desc' },
  })
  return NextResponse.json(txns)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const b = await request.json()
  if (!b.policyId) return NextResponse.json({ error: 'policyId is required' }, { status: 400 })
  const policy = await prisma.phiPolicy.findFirst({ where: { id: b.policyId, userId } })
  if (!policy) return NextResponse.json({ error: 'Policy not found' }, { status: 404 })
  const amount = b.amount != null && b.amount !== '' ? parseFloat(b.amount) : 0
  const txn = await prisma.phiTransaction.create({
    data: {
      userId,
      policyId: b.policyId,
      date: b.date ? new Date(b.date) : new Date(),
      type: b.type || 'benefit',
      amount,
      description: b.description || null,
    },
  })
  return NextResponse.json(txn, { status: 201 })
}
