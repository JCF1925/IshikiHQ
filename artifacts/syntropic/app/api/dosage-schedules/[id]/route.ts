export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { scheduleUpdateSchema, validationError } from '@/lib/medication-validation'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params
  const parsed = scheduleUpdateSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json(validationError(parsed.error), { status: 400 })
  const b = parsed.data
  const owned = await prisma.dosageSchedule.findFirst({ where: { id, userId } })
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const data: any = { ...b }
  if ('doseAmount' in data) data.doseAmount = String(data.doseAmount)
  const startDate = data.startDate ?? owned.startDate
  const endDate = data.endDate === undefined ? owned.endDate : data.endDate
  if (endDate && endDate < startDate) {
    return NextResponse.json({ error: 'endDate must be on or after startDate' }, { status: 400 })
  }
  const updated = await prisma.dosageSchedule.update({ where: { id }, data })
  return NextResponse.json(updated)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params
  const result = await prisma.dosageSchedule.updateMany({ where: { id, userId }, data: { isActive: false, endDate: new Date() } })
  if (!result.count) return NextResponse.json({ error: 'Schedule was not found' }, { status: 404 })
  return NextResponse.json({ ok: true, archived: true })
}
