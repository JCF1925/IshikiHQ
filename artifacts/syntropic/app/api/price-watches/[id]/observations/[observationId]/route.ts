import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { priceObservationUpdateSchema } from '@/lib/validation'
type Ctx = { params: Promise<{ id: string; observationId: string }> }
async function user() { const s = await auth(); return s?.user ? (s.user as { id: string }).id : null }
export async function PATCH(request: Request, { params }: Ctx) {
  const userId = await user(); const { id: watchId, observationId } = await params
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const current = await prisma.priceObservation.findFirst({ where: { id: observationId, watchId, userId } })
  if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const parsed = priceObservationUpdateSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed', issues: parsed.error.flatten() }, { status: 400 })
  return NextResponse.json(await prisma.priceObservation.update({ where: { id: observationId }, data: parsed.data }))
}
export async function DELETE(_: Request, { params }: Ctx) {
  const userId = await user(); const { id: watchId, observationId } = await params
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const result = await prisma.priceObservation.deleteMany({ where: { id: observationId, watchId, userId } })
  if (!result.count) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}