export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { parseBody } from '@/lib/api'
import { projectCreateSchema } from '@/lib/validation'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id

  const projects = await prisma.project.findMany({
    where: { userId },
    include: {
      organisation: { select: { id: true, name: true } },
      goal: { select: { id: true, title: true } },
      events: { select: { id: true, title: true, startDatetime: true, visibility: true } },
      _count: { select: { tasks: true, events: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(projects)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const parsed = await parseBody(request, projectCreateSchema)
  if (!parsed.success) return parsed.response
  const body = parsed.data

  const [org, goal, taskCount, eventCount] = await Promise.all([
    body.organisationId ? prisma.organisation.findFirst({ where: { id: body.organisationId, userId }, select: { id: true } }) : null,
    body.goalId ? prisma.goal.findFirst({ where: { id: body.goalId, userId }, select: { id: true } }) : null,
    body.taskIds?.length ? prisma.task.count({ where: { id: { in: body.taskIds }, userId } }) : 0,
    body.eventIds?.length ? prisma.event.count({ where: { id: { in: body.eventIds }, userId } }) : 0,
  ])
  if ((body.organisationId && !org) || (body.goalId && !goal) ||
      taskCount !== (body.taskIds?.length ?? 0) || eventCount !== (body.eventIds?.length ?? 0)) {
    return NextResponse.json({ error: 'A linked record was not found or is not owned by you' }, { status: 400 })
  }

  const project = await prisma.$transaction(async (tx) => {
    const created = await tx.project.create({ data: {
      userId,
      name: body.name,
      description: body.description ?? null,
      status: body.status ?? 'active',
      goalId: body.goalId ?? null,
      organisationId: body.organisationId ?? null,
    } })
    if (body.taskIds?.length) await tx.task.updateMany({ where: { id: { in: body.taskIds }, userId }, data: { projectId: created.id } })
    if (body.eventIds?.length) await tx.event.updateMany({ where: { id: { in: body.eventIds }, userId }, data: { projectId: created.id } })
    return created
  })
  return NextResponse.json(project, { status: 201 })
}
