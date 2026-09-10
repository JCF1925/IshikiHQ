export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id

  const categories = await prisma.category.findMany({
    where: { userId },
    orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  })
  return NextResponse.json(categories)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const body = await request.json()

  if (!body.name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  // Derive level from parent (max 3 levels)
  let level = 1
  let kind = body.kind ?? 'expense'
  if (body.parentId) {
    const parent = await prisma.category.findFirst({ where: { id: body.parentId, userId } })
    if (!parent) return NextResponse.json({ error: 'Parent not found' }, { status: 400 })
    if (parent.level >= 3) return NextResponse.json({ error: 'Maximum of 3 levels allowed' }, { status: 400 })
    level = parent.level + 1
    kind = parent.kind // children inherit kind from root
  }

  const category = await prisma.category.create({
    data: {
      userId,
      name: body.name.trim(),
      kind,
      level,
      parentId: body.parentId ?? null,
      taxCategory: body.taxCategory ?? null,
      sortOrder: body.sortOrder ?? 0,
    },
  })
  return NextResponse.json(category, { status: 201 })
}
