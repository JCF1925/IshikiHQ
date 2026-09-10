export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { parseBody } from '@/lib/api'
import { employmentRoleSchema } from '@/lib/validation'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  return NextResponse.json(await prisma.employmentRole.findMany({
    where: { userId },
    include: { organisation: { select: { id: true, name: true } }, compensation: { orderBy: { effectiveFrom: 'desc' } } },
    orderBy: [{ startDate: 'desc' }, { title: 'asc' }],
  }))
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const parsed = await parseBody(request, employmentRoleSchema)
  if (!parsed.success) return parsed.response
  const { organisationId, incomeSourceId } = parsed.data
  const [organisation, income] = await Promise.all([
    prisma.organisation.findFirst({ where: { id: organisationId, userId }, select: { id: true } }),
    incomeSourceId ? prisma.incomeSource.findFirst({ where: { id: incomeSourceId, userId }, select: { id: true } }) : null,
  ])
  if (!organisation || (incomeSourceId && !income)) return NextResponse.json({ error: 'A linked record was not found or is not owned by you' }, { status: 400 })
  return NextResponse.json(await prisma.employmentRole.create({ data: { userId, ...parsed.data } }), { status: 201 })
}