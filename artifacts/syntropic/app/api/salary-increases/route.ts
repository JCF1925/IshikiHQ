export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { apiError, parseBody } from '@/lib/api'
import { salaryIncreaseCreateSchema } from '@/lib/validation'

function salaryIncreaseFailure(error: unknown) {
  const diagnosticId = randomUUID()
  console.error('[income] salary increase save failed', {
    diagnosticId,
    error: error instanceof Error ? error.name : 'unknown',
  })
  return apiError('INTERNAL_ERROR', 'Pay change could not be saved. Try again.', 500, { diagnosticId })
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const parsed = await parseBody(request, salaryIncreaseCreateSchema)
  if (!parsed.success) return parsed.response
  const body = parsed.data

  try {
    const src = await prisma.incomeSource.findFirst({ where: { id: body.incomeSourceId, userId } })
    if (!src) return NextResponse.json({ error: 'Income source not found' }, { status: 404 })

    const inc = await prisma.salaryIncrease.create({
      data: {
        userId,
        incomeSourceId: body.incomeSourceId,
        effectiveDate: body.effectiveDate,
        changeType: body.changeType,
        value: body.value,
        newSuperRate: body.changeType === 'sg_rate' ? body.newSuperRate : null,
        notes: body.notes || null,
        status: 'pending',
      },
    })
    return NextResponse.json(inc, { status: 201 })
  } catch (error) {
    return salaryIncreaseFailure(error)
  }
}
