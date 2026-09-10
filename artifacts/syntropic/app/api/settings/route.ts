export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id

  const [user, redbarkCredential] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { timezone: true, currency: true, theme: true } }),
    prisma.userSetting.findUnique({ where: { userId_key: { userId, key: 'redbark_api_key' } }, select: { id: true } }),
  ])

  return NextResponse.json({
    ...user,
    settings: { redbark_api_key_configured: Boolean(redbarkCredential) },
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PUT(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const body = await request.json()

  // Update user profile fields
  const allowedTimezones = new Set(['Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane', 'Australia/Perth', 'UTC'])
  const allowedCurrencies = new Set(['AUD', 'USD', 'GBP', 'EUR'])
  const allowedThemes = new Set(['dark', 'light', 'system'])
  if (
    !allowedTimezones.has(body.timezone)
    || !allowedCurrencies.has(body.currency)
    || !allowedThemes.has(body.theme)
  ) {
    return NextResponse.json({ error: 'Invalid settings' }, { status: 400 })
  }
  await prisma.user.update({
    where: { id: userId },
    data: {
      timezone: body.timezone,
      currency: body.currency,
      theme: body.theme,
    },
  })

  const redbarkKey = body.settings?.redbark_api_key
  if (redbarkKey !== undefined) {
    if (typeof redbarkKey !== 'string' || redbarkKey.length > 2048) {
      return NextResponse.json({ error: 'Invalid integration credential' }, { status: 400 })
    }
    if (redbarkKey.trim()) {
      await prisma.userSetting.upsert({
        where: { userId_key: { userId, key: 'redbark_api_key' } },
        update: { value: redbarkKey.trim() },
        create: { userId, key: 'redbark_api_key', value: redbarkKey.trim() },
      })
    }
  }

  return NextResponse.json({ success: true })
}
