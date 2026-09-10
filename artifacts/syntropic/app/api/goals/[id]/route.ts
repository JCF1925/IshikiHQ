export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { parseBody } from '@/lib/api'
import { goalUpdateSchema, type GoalUpdateInput } from '@/lib/validation'
import { Prisma } from '@prisma/client'

const RECENT_PROGRESS_LIMIT = 5
const HISTORY_PAGE_SIZE = 20
const MAX_HISTORY_PAGE_SIZE = 100
const progressHistoryOrder = [{ recordedAt: 'desc' as const }, { createdAt: 'desc' as const }, { id: 'desc' as const }]

async function withSerializableRetry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034' || attempt >= 2) throw error
    }
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params
  const searchParams = new URL(req.url).searchParams
  const requestedPage = Number(searchParams.get('page') ?? '1')
  const requestedPageSize = Number(searchParams.get('pageSize') ?? HISTORY_PAGE_SIZE)
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const pageSize = Number.isInteger(requestedPageSize) && requestedPageSize > 0
    ? Math.min(requestedPageSize, MAX_HISTORY_PAGE_SIZE)
    : HISTORY_PAGE_SIZE

  const goal = await prisma.goal.findFirst({
    where: { id, userId },
    include: {
      projects: { select: { id: true, name: true, status: true, _count: { select: { tasks: true } } } },
    },
  })
  if (!goal) return NextResponse.json({ error: 'Goal not found' }, { status: 404 })

  const [progressEntries, totalEntries] = await Promise.all([
    prisma.goalProgressEntry.findMany({
      where: { goalId: id, userId },
      orderBy: progressHistoryOrder,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.goalProgressEntry.count({ where: { goalId: id, userId } }),
  ])

  return NextResponse.json({
    ...goal,
    progressEntries,
    progressEntryCount: totalEntries,
    pagination: {
      page,
      pageSize,
      totalEntries,
      totalPages: Math.ceil(totalEntries / pageSize),
      hasPreviousPage: page > 1,
      hasNextPage: page * pageSize < totalEntries,
    },
  })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params
  const parsed = await parseBody(req, goalUpdateSchema)
  if (!parsed.success) return parsed.response
  const body = parsed.data as GoalUpdateInput
  const data: any = {}
  if (body.title !== undefined) data.title = body.title
  if (body.category !== undefined) data.category = body.category
  if (body.targetValue !== undefined) data.targetValue = body.targetValue
  if (body.currentValue !== undefined) data.currentValue = body.currentValue
  if (body.unit !== undefined) data.unit = body.unit
  if (body.targetDate !== undefined) data.targetDate = body.targetDate ? new Date(body.targetDate) : null
  if (body.status !== undefined) {
    data.status = body.status
  }
  if (body.milestones !== undefined) data.milestones = body.milestones ? JSON.stringify(body.milestones) : null
  if (body.notes !== undefined) data.notes = body.notes

  const goal = await withSerializableRetry(() => prisma.$transaction(async (tx) => {
    const existing = await tx.goal.findFirst({ where: { id, userId }, select: { currentValue: true, targetValue: true } })
    if (!existing) return null

    const nextValue = body.currentValue ?? null
    const measurable = (body.targetValue !== undefined ? body.targetValue : existing.targetValue) != null
    const becameMeasurable = existing.targetValue == null && body.targetValue != null
    const valueChanged = body.currentValue !== undefined && nextValue !== existing.currentValue

    await tx.goal.updateMany({ where: { id, userId }, data })
    if (measurable && (valueChanged || becameMeasurable)) {
      await tx.goalProgressEntry.create({
        data: {
          userId,
          goalId: id,
          value: body.currentValue ?? existing.currentValue ?? 0,
          recordedAt: body.progressDate ?? new Date(),
        },
      })
    }
    return tx.goal.findFirst({
      where: { id, userId },
      include: {
        projects: { select: { id: true, name: true, status: true, _count: { select: { tasks: true } } } },
        progressEntries: { take: RECENT_PROGRESS_LIMIT, orderBy: progressHistoryOrder },
        _count: { select: { progressEntries: true } },
      },
    })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }))
  if (!goal) return NextResponse.json({ error: 'Goal not found' }, { status: 404 })
  return NextResponse.json(goal)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params

  await prisma.$transaction(async (tx) => {
    await tx.project.updateMany({ where: { goalId: id, userId }, data: { goalId: null } })
    await tx.goal.deleteMany({ where: { id, userId } })
  })
  return NextResponse.json({ success: true })
}
