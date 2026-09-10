export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { parseBody } from '@/lib/api'
import {
  goalProgressEntryDeleteSchema,
  goalProgressEntryUpdateSchema,
} from '@/lib/validation'

type RouteContext = { params: Promise<{ id: string; entryId: string }> }

async function withSerializableRetry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034' || attempt >= 2) throw error
    }
  }
}

const goalInclude: Prisma.GoalInclude = {
  projects: { select: { id: true, name: true, status: true, _count: { select: { tasks: true } } } },
  progressEntries: { orderBy: [{ recordedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }] },
}

async function refreshGoalCurrentValue(tx: any, goalId: string, userId: string) {
  const newest = await tx.goalProgressEntry.findFirst({
    where: { goalId, userId },
    orderBy: [{ recordedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    select: { value: true },
  })
  await tx.goal.updateMany({
    where: { id: goalId, userId },
    data: { currentValue: newest?.value ?? 0 },
  })
}

async function correctProgressEntry(
  tx: any,
  { goalId, entryId, userId, value, recordedAt }: {
    goalId: string
    entryId: string
    userId: string
    value?: number
    recordedAt?: Date
  },
) {
  const existing = await tx.goalProgressEntry.findFirst({
    where: { id: entryId, goalId, userId },
    select: { id: true },
  })
  if (!existing) return null

  await tx.goalProgressEntry.update({
    where: { id: entryId },
    data: {
      ...(value !== undefined ? { value } : {}),
      ...(recordedAt !== undefined ? { recordedAt } : {}),
    },
  })
  await refreshGoalCurrentValue(tx, goalId, userId)
  return tx.goal.findFirst({ where: { id: goalId, userId }, include: goalInclude })
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id: goalId, entryId } = await params
  const parsed = await parseBody(request, goalProgressEntryUpdateSchema)
  if (!parsed.success) return parsed.response
  const userId = (session.user as any).id
  const correction = parsed.data as { value?: number; recordedAt?: Date }

  const goal = await withSerializableRetry(() => prisma.$transaction(async (tx) => (
    correctProgressEntry(tx, {
      goalId,
      entryId,
      userId,
      value: correction.value,
      recordedAt: correction.recordedAt,
    })
  ), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }))

  if (!goal) return NextResponse.json({ error: 'Progress entry not found' }, { status: 404 })
  return NextResponse.json(goal)
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id: goalId, entryId } = await params
  const parsed = await parseBody(request, goalProgressEntryDeleteSchema)
  if (!parsed.success) return parsed.response
  const userId = (session.user as any).id

  const goal = await withSerializableRetry(() => prisma.$transaction(async (tx) => {
    const existing = await tx.goalProgressEntry.findFirst({
      where: { id: entryId, goalId, userId },
      select: { id: true },
    })
    if (!existing) return null

    await tx.goalProgressEntry.delete({ where: { id: entryId } })
    await refreshGoalCurrentValue(tx, goalId, userId)
    return tx.goal.findFirst({ where: { id: goalId, userId }, include: goalInclude })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }))

  if (!goal) return NextResponse.json({ error: 'Progress entry not found' }, { status: 404 })
  return NextResponse.json(goal)
}