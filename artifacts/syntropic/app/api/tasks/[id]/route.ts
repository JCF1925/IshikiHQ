export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params
  const body = await req.json()
  if (body.projectId && !await prisma.project.findFirst({ where: { id: body.projectId, userId }, select: { id: true } })) {
    return NextResponse.json({ error: 'Project not found' }, { status: 400 })
  }

  const data: any = {}
  if (body.title !== undefined) data.title = body.title
  if (body.description !== undefined) data.description = body.description
  if (body.status !== undefined) {
    data.status = body.status
    if (body.status === 'done') data.completedAt = new Date()
  }
  if (body.priority !== undefined) data.priority = body.priority
  if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null
  if (body.dueTime !== undefined) data.dueTime = body.dueTime
  if (body.tags !== undefined) data.tags = body.tags
  if (body.projectId !== undefined) data.projectId = body.projectId

  const task = await prisma.task.updateMany({ where: { id, userId }, data })
  return NextResponse.json(task)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params

  await prisma.task.deleteMany({ where: { id, userId } })
  return NextResponse.json({ success: true })
}
