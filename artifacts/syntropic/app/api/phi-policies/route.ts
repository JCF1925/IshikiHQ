export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { healthClaimOwnerWhere } from '@/lib/account-security'

const num = (v: any) => (v != null && v !== '' ? parseFloat(v) : null)

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const policies = await prisma.phiPolicy.findMany({
    where: healthClaimOwnerWhere(userId),
    include: { insurer: { select: { id: true, name: true } }, limits: { orderBy: { category: 'asc' } }, transactions: { orderBy: { date: 'desc' } }, claims: { orderBy: { serviceDate: 'desc' } } },
    orderBy: { createdAt: 'desc' },
  })
  const enriched = policies.map((p: any) => {
    const premiumsPaid = p.transactions.filter((t: any) => t.type === 'premium').reduce((s: number, t: any) => s + t.amount, 0)
    const offsets = p.transactions.filter((t: any) => t.type !== 'premium').reduce((s: number, t: any) => s + t.amount, 0)
    return { ...p, premiumsPaid, offsets, effectiveCost: premiumsPaid - offsets }
  })
  return NextResponse.json(enriched)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const b = await request.json()
  const limits = Array.isArray(b.limits) ? b.limits : []
  const policy = await prisma.phiPolicy.create({
    data: {
      userId,
      insurerId: b.insurerId || null,
      policyName: b.policyName,
      policyNumber: b.policyNumber || null,
      coverType: b.coverType || 'combined',
      premium: num(b.premium),
      premiumFrequency: b.premiumFrequency || null,
      excess: num(b.excess),
      startDate: b.startDate ? new Date(b.startDate) : null,
      endDate: b.endDate ? new Date(b.endDate) : null,
      isActive: b.isActive ?? true,
      notes: b.notes || null,
      limits: {
        create: limits
          .filter((l: any) => l.category)
          .map((l: any) => ({ userId, category: l.category, annualLimit: num(l.annualLimit), usedAmount: num(l.usedAmount) ?? 0, notes: l.notes || null })),
      },
    },
    include: { limits: true },
  })
  return NextResponse.json(policy, { status: 201 })
}
