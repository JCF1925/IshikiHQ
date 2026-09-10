export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { capitalGain, fyOfDate } from '@/lib/tax'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const events = await prisma.capitalGainEvent.findMany({ where: { userId }, orderBy: { acquireDate: 'desc' } })

  const enriched = events.map((e) => {
    if (e.disposalDate && e.disposalProceeds != null) {
      const cg = capitalGain(e.acquireCost, e.disposalProceeds, e.acquireDate, e.disposalDate)
      return { ...e, ...cg, realised: true }
    }
    return { ...e, gross: 0, discounted: 0, heldMonths: 0, eligible: false, realised: false }
  })

  // Aggregate realised gains/losses by FY of disposal
  const byFy: Record<string, { gross: number; discounted: number; gains: number; losses: number }> = {}
  for (const e of enriched) {
    if (!e.realised || !e.disposalDate) continue
    const fy = e.financialYear || fyOfDate(new Date(e.disposalDate))
    byFy[fy] = byFy[fy] || { gross: 0, discounted: 0, gains: 0, losses: 0 }
    byFy[fy].gross += e.gross
    byFy[fy].discounted += e.discounted
    if (e.gross >= 0) byFy[fy].gains += e.discounted
    else byFy[fy].losses += e.gross
  }
  const summary = Object.entries(byFy)
    .map(([fy, v]) => ({ fy, ...v, net: Math.round((v.gains + v.losses) * 100) / 100 }))
    .sort((a, b) => (a.fy < b.fy ? 1 : -1))

  return NextResponse.json({ events: enriched, summary })
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const body = await request.json()
  const disposalDate = body.disposalDate ? new Date(body.disposalDate) : null
  const item = await prisma.capitalGainEvent.create({
    data: {
      userId,
      assetName: body.assetName,
      assetType: body.assetType || 'shares',
      quantity: body.quantity ? parseFloat(body.quantity) : null,
      acquireDate: body.acquireDate ? new Date(body.acquireDate) : new Date(),
      acquireCost: Math.abs(parseFloat(body.acquireCost)) || 0,
      disposalDate,
      disposalProceeds: body.disposalProceeds != null && body.disposalProceeds !== '' ? parseFloat(body.disposalProceeds) : null,
      financialYear: disposalDate ? fyOfDate(disposalDate) : null,
      notes: body.notes || null,
    },
  })
  return NextResponse.json(item, { status: 201 })
}
