export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

const KEY = 'calendar_token'

function feedUrl(token: string) {
  const base = process.env.NEXTAUTH_URL || ''
  return `${base.replace(/\/$/, '')}/api/calendar/${token}`
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id

  let setting = await prisma.userSetting.findUnique({ where: { userId_key: { userId, key: KEY } } })
  if (!setting) {
    setting = await prisma.userSetting.create({ data: { userId, key: KEY, value: randomUUID().replace(/-/g, '') } })
  }
  return NextResponse.json({ token: setting.value, url: feedUrl(setting.value) })
}

export async function POST() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const value = randomUUID().replace(/-/g, '')
  const setting = await prisma.userSetting.upsert({
    where: { userId_key: { userId, key: KEY } },
    update: { value },
    create: { userId, key: KEY, value },
  })
  return NextResponse.json({ token: setting.value, url: feedUrl(setting.value) })
}
