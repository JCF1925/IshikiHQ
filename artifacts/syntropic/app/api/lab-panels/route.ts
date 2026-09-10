export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

const num = (v: any) => (v != null && v !== '' ? parseFloat(v) : null)

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const panels = await prisma.labPanel.findMany({
    where: { userId },
    include: { results: { orderBy: { analyte: 'asc' } } },
    orderBy: { collectedDate: 'desc' },
  })
  return NextResponse.json(panels)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const b = await request.json()
  const results = Array.isArray(b.results) ? b.results : []
  const panel = await prisma.labPanel.create({
    data: {
      userId,
      name: b.name,
      category: b.category || 'pathology',
      discipline: b.discipline || 'other',
      collectedDate: b.collectedDate ? new Date(b.collectedDate) : new Date(),
      provider: b.provider || null,
      cloudStoragePath: b.cloudStoragePath || null,
      summary: b.summary || null,
      notes: b.notes || null,
      results: {
        create: results
          .filter((r: any) => r.analyte)
          .map((r: any) => ({
            userId,
            analyte: r.analyte,
            resultType: r.resultType || 'quantitative',
            value: num(r.value),
            valueText: r.valueText || null,
            unit: r.unit || null,
            refLow: num(r.refLow),
            refHigh: num(r.refHigh),
            flag: r.flag || null,
            notes: r.notes || null,
          })),
      },
    },
    include: { results: true },
  })
  return NextResponse.json(panel, { status: 201 })
}
