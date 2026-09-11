export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body || Array.isArray(body) || typeof body !== 'object') {
    return NextResponse.json({ error: 'Practice details must be a JSON object' }, { status: 400 })
  }

  const data: Record<string, string | null> = {}
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    data.name = body.name.trim()
  }
  for (const field of ['type', 'address', 'phone', 'website', 'notes', 'medicarePracticeIdentifier']) {
    if (body[field] === undefined) continue
    if (body[field] !== null && typeof body[field] !== 'string') {
      return NextResponse.json({ error: `${field} must be text` }, { status: 400 })
    }
    data[field] = typeof body[field] === 'string' ? body[field].trim() || null : null
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'At least one practice detail is required' }, { status: 400 })
  }

  const existing = await prisma.organisation.findFirst({ where: { id, userId } })
  if (!existing) return NextResponse.json({ error: 'Practice not found' }, { status: 404 })

  const organisation = await prisma.organisation.update({ where: { id }, data })
  return NextResponse.json({ success: true, organisation })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params

  await prisma.person.updateMany({ where: { organisationId: id, userId }, data: { organisationId: null } })
  await prisma.organisation.deleteMany({ where: { id, userId } })
  return NextResponse.json({ success: true })
}
