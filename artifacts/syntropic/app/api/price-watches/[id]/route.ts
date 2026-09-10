import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { priceWatchUpdateSchema } from '@/lib/validation'

type Ctx = { params: Promise<{ id: string }> }
async function getUser() { const s = await auth(); return s?.user ? (s.user as { id: string }).id : null }
export async function PATCH(request: Request, { params }: Ctx) {
  const userId = await getUser(); const { id } = await params
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!await prisma.priceWatch.findFirst({ where: { id, userId }, select: { id: true } })) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const parsed = priceWatchUpdateSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed', issues: parsed.error.flatten() }, { status: 400 })
  return NextResponse.json(await prisma.priceWatch.update({ where: { id }, data: parsed.data }))
}
export async function DELETE(_: Request, { params }: Ctx) {
  const userId = await getUser(); const { id } = await params
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const result = await prisma.priceWatch.deleteMany({ where: { id, userId } })
  if (!result.count) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}