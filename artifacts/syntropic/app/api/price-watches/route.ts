export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { priceWatchCreateSchema } from '@/lib/validation'

async function owner() {
  const session = await auth()
  return session?.user ? (session.user as { id: string }).id : null
}
export async function GET() {
  const userId = await owner()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await prisma.priceWatch.findMany({
    where: { userId }, include: { observations: { where: { userId }, orderBy: { observedAt: 'desc' } } },
    orderBy: { updatedAt: 'desc' },
  }))
}
export async function POST(request: Request) {
  const userId = await owner()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = priceWatchCreateSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed', issues: parsed.error.flatten() }, { status: 400 })
  return NextResponse.json(await prisma.priceWatch.create({ data: { ...parsed.data, userId } }), { status: 201 })
}