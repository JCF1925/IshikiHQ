import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { priceObservationCreateSchema } from '@/lib/validation'
type Ctx = { params: Promise<{ id: string }> }
async function user() { const s = await auth(); return s?.user ? (s.user as { id: string }).id : null }
export async function GET(_: Request, { params }: Ctx) {
  const userId = await user(); const { id: watchId } = await params
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!await prisma.priceWatch.findFirst({ where: { id: watchId, userId }, select: { id: true } })) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(await prisma.priceObservation.findMany({ where: { watchId, userId }, orderBy: { observedAt: 'desc' } }))
}
export async function POST(request: Request, { params }: Ctx) {
  const userId = await user(); const { id: watchId } = await params
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!await prisma.priceWatch.findFirst({ where: { id: watchId, userId }, select: { id: true } })) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const parsed = priceObservationCreateSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed', issues: parsed.error.flatten() }, { status: 400 })
  return NextResponse.json(await prisma.priceObservation.create({ data: { ...parsed.data, userId, watchId } }), { status: 201 })
}