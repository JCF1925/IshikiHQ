export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params
  const b = await request.json()
  const owned = await prisma.healthCondition.findFirst({ where: { id, userId } })
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const data: any = {}
  for (const k of ['name', 'icd10Code', 'status', 'notes']) if (k in b) data[k] = b[k]
  if ('diagnosedDate' in b) data.diagnosedDate = b.diagnosedDate ? new Date(b.diagnosedDate) : null
  if (Array.isArray(b.medicationIds)) data.medications = { set: b.medicationIds.map((mid: string) => ({ id: mid })) }

  const updated = await prisma.healthCondition.update({ where: { id }, data })
  return NextResponse.json(updated)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params
  await prisma.healthCondition.deleteMany({ where: { id, userId } })
  return NextResponse.json({ ok: true })
}
