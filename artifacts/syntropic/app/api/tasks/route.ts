export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const url = new URL(request.url)
  const status = url.searchParams.get('status')
  const projectId = url.searchParams.get('projectId')

  const where: any = { userId }
  if (status) where.status = status
  if (projectId) where.projectId = projectId

  const tasks = await prisma.task.findMany({
    where,
    include: { project: true },
    orderBy: [{ priority: 'asc' }, { dueDate: 'asc' }],
  })
  return NextResponse.json(tasks)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const body = await request.json()
  if (body.projectId && !await prisma.project.findFirst({ where: { id: body.projectId, userId }, select: { id: true } })) {
    return NextResponse.json({ error: 'Project not found' }, { status: 400 })
  }

  const task = await prisma.task.create({
    data: {
      userId,
      title: body.title,
      description: body.description ?? null,
      status: body.status ?? 'todo',
      priority: body.priority ?? 'medium',
      isUrgent: body.isUrgent ?? false,
      isImportant: body.isImportant ?? false,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      dueTime: body.dueTime ?? null,
      estimatedMinutes: body.estimatedMinutes ?? null,
      tags: body.tags ?? [],
      moduleRef: body.moduleRef ?? null,
      recurrenceRule: body.recurrenceRule ?? null,
      projectId: body.projectId ?? null,
    },
  })
  return NextResponse.json(task, { status: 201 })
}
