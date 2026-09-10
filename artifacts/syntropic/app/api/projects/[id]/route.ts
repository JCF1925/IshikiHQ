export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { parseBody } from '@/lib/api'
import { projectUpdateSchema } from '@/lib/validation'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params
  const parsed = await parseBody(req, projectUpdateSchema)
  if (!parsed.success) return parsed.response
  const body = parsed.data
  const existing = await prisma.project.findFirst({ where: { id, userId }, select: { id: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

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

  const data: any = {}
  if (body.name !== undefined) data.name = body.name
  if (body.description !== undefined) data.description = body.description
  if (body.status !== undefined) data.status = body.status
  if (body.goalId !== undefined) data.goalId = body.goalId || null
  if (body.organisationId !== undefined) data.organisationId = body.organisationId || null

  await prisma.$transaction(async (tx) => {
    await tx.project.update({ where: { id }, data })
    if (body.taskIds) {
      await tx.task.updateMany({ where: { projectId: id, userId }, data: { projectId: null } })
      await tx.task.updateMany({ where: { id: { in: body.taskIds }, userId }, data: { projectId: id } })
    }
    if (body.eventIds) {
      await tx.event.updateMany({ where: { projectId: id, userId }, data: { projectId: null } })
      await tx.event.updateMany({ where: { id: { in: body.eventIds }, userId }, data: { projectId: id } })
    }
  })
  const project = await prisma.project.findFirst({ where: { id, userId }, include: { organisation: true, goal: true, events: true, _count: { select: { tasks: true, events: true } } } })
  return NextResponse.json(project)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params

  await prisma.task.updateMany({ where: { projectId: id, userId }, data: { projectId: null } })
  await prisma.project.deleteMany({ where: { id, userId } })
  return NextResponse.json({ success: true })
}
