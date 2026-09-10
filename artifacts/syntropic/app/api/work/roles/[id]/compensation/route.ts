export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { parseBody } from '@/lib/api'
import { compensationSchema } from '@/lib/validation'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params
  const parsed = await parseBody(request, compensationSchema)
  if (!parsed.success) return parsed.response
  const role = await prisma.employmentRole.findFirst({ where: { id, userId } })
  if (!role) return NextResponse.json({ error: 'Role not found' }, { status: 404 })
  return NextResponse.json(await prisma.employmentCompensation.create({
    data: { userId, roleId: id, ...parsed.data, currency: (parsed.data.currency ?? 'AUD').toUpperCase() },
  }), { status: 201 })
}