export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const b = await request.json()

  // resolve vital type by id or name (offline logging may send name)
  let vitalTypeId = b.vitalTypeId
  if (!vitalTypeId && b.vitalTypeName) {
    const vt = await prisma.vitalType.upsert({
      where: { userId_name: { userId, name: b.vitalTypeName } },
      update: {},
      create: { userId, name: b.vitalTypeName, unit: b.unit || '' },
    })
    vitalTypeId = vt.id
  }
  if (!vitalTypeId) return NextResponse.json({ error: 'vitalTypeId required' }, { status: 400 })

  const log = await prisma.vitalLog.create({
    data: {
      userId,
      vitalTypeId,
      value: parseFloat(b.value),
      loggedAt: b.loggedAt ? new Date(b.loggedAt) : new Date(),
      device: b.device || null,
      notes: b.notes || null,
    },
  })
  return NextResponse.json(log, { status: 201 })
}
