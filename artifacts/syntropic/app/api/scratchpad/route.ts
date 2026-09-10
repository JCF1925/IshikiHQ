export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

const KEY = 'business_scratchpad'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id

  const setting = await prisma.userSetting.findUnique({ where: { userId_key: { userId, key: KEY } } })
  let data: any = {}
  if (setting) { try { data = JSON.parse(setting.value) } catch { data = {} } }
  return NextResponse.json({ data, updatedAt: setting ? undefined : null })
}

export async function PUT(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const body = await request.json()
  const value = JSON.stringify(body.data ?? {})

  await prisma.userSetting.upsert({
    where: { userId_key: { userId, key: KEY } },
    update: { value },
    create: { userId, key: KEY, value },
  })
  return NextResponse.json({ success: true })
}
