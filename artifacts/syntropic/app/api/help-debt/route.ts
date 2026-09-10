export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const items = await prisma.hELPDebt.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } })
  return NextResponse.json(items)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const body = await request.json()
  const item = await prisma.hELPDebt.create({
    data: {
      userId,
      originalAmount: Math.abs(parseFloat(body.originalAmount)) || 0,
      currentBalance: Math.abs(parseFloat(body.currentBalance)) || 0,
      indexationDate: body.indexationDate ? new Date(body.indexationDate) : null,
      repaymentThreshold: body.repaymentThreshold ? parseFloat(body.repaymentThreshold) : null,
      annualRepayment: parseFloat(body.annualRepayment) || 0,
      notes: body.notes || null,
    },
  })
  return NextResponse.json(item, { status: 201 })
}
