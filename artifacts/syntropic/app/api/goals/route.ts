export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { parseBody } from '@/lib/api'
import { goalCreateSchema, type GoalCreateInput } from '@/lib/validation'

const RECENT_PROGRESS_LIMIT = 5
const progressSummary = {
  take: RECENT_PROGRESS_LIMIT,
  orderBy: [{ recordedAt: 'desc' as const }, { createdAt: 'desc' as const }, { id: 'desc' as const }],
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id

  const goals = await prisma.goal.findMany({
    where: { userId },
    include: {
      projects: { select: { id: true, name: true, status: true, _count: { select: { tasks: true } } } },
      progressEntries: progressSummary,
      _count: { select: { progressEntries: true } },
    },
    orderBy: [{ status: 'asc' }, { targetDate: 'asc' }, { createdAt: 'desc' }],
  })
  return NextResponse.json(goals)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const parsed = await parseBody(request, goalCreateSchema)
  if (!parsed.success) return parsed.response
  const body = parsed.data as GoalCreateInput

  const goal = await prisma.$transaction(async (tx) => {
    const created = await tx.goal.create({ data: {
      userId,
      title: body.title,
      category: body.category ?? 'personal',
      targetValue: body.targetValue ?? null,
      currentValue: body.currentValue ?? 0,
      unit: body.unit ?? null,
      targetDate: body.targetDate ? new Date(body.targetDate) : null,
      status: body.status ?? 'active',
      milestones: body.milestones?.length ? JSON.stringify(body.milestones) : null,
      notes: body.notes ?? null,
    } })
    if (body.targetValue != null) {
      await tx.goalProgressEntry.create({ data: {
        userId, goalId: created.id, value: body.currentValue ?? 0, recordedAt: body.progressDate ?? new Date(),
      } })
    }
    return tx.goal.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        projects: { select: { id: true, name: true, status: true, _count: { select: { tasks: true } } } },
        progressEntries: progressSummary,
        _count: { select: { progressEntries: true } },
      },
    })
  })
  return NextResponse.json(goal, { status: 201 })
}
