export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { parseBody } from '@/lib/api'
import { employmentRoleUpdateSchema } from '@/lib/validation'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params
  const parsed = await parseBody(request, employmentRoleUpdateSchema)
  if (!parsed.success) return parsed.response
  const existing = await prisma.employmentRole.findFirst({ where: { id, userId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const startDate = parsed.data.startDate ?? existing.startDate
  const endDate = parsed.data.endDate === undefined ? existing.endDate : parsed.data.endDate
  if (endDate && endDate < startDate) return NextResponse.json({ error: 'End date must be on or after start date' }, { status: 400 })
  const organisationId = parsed.data.organisationId
  const incomeSourceId = parsed.data.incomeSourceId
  if (organisationId && !await prisma.organisation.findFirst({ where: { id: organisationId, userId } })) return NextResponse.json({ error: 'Organisation not found' }, { status: 400 })
  if (incomeSourceId && !await prisma.incomeSource.findFirst({ where: { id: incomeSourceId, userId } })) return NextResponse.json({ error: 'Income source not found' }, { status: 400 })
  return NextResponse.json(await prisma.employmentRole.update({ where: { id }, data: parsed.data }))
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params
  const result = await prisma.employmentRole.deleteMany({ where: { id, userId } })
  if (!result.count) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}