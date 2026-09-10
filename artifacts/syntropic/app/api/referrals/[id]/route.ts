export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { calculateReferralExpiry } from '@/lib/referrals'

const VALIDITY_TYPES = new Set(['six_months', 'twelve_months', 'indefinite', 'custom'])
const SERVICE_LIMIT_PERIODS = new Set(['calendar_year', 'rolling_twelve_months'])

function parseDate(value: unknown, fallback: Date | null = null) {
  if (typeof value !== 'string' || !value) return fallback
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) ? fallback : date
}

function parseLimit(value: unknown) {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params
  const b = await request.json()
  const owned = await prisma.referral.findFirst({ where: { id, userId } })
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (b.action === 'use') return NextResponse.json({ error: 'Referral usage is recorded from completed appointments' }, { status: 400 })
  const data: any = {}
  for (const k of ['reason', 'notes']) if (k in b) data[k] = b[k] || null
  if ('isActive' in b) data.isActive = !!b.isActive
  if ('appointmentLimit' in b) data.appointmentLimit = parseLimit(b.appointmentLimit)
  if ('validityType' in b) data.validityType = VALIDITY_TYPES.has(b.validityType) ? b.validityType : 'custom'
  if ('serviceLimitPeriod' in b) data.serviceLimitPeriod = SERVICE_LIMIT_PERIODS.has(b.serviceLimitPeriod) ? b.serviceLimitPeriod : null
  if ('issueDate' in b) data.issueDate = parseDate(b.issueDate)
  if ('expiryDate' in b || 'validityType' in b || 'issueDate' in b) {
    const issueDate = data.issueDate ?? owned.issueDate
    const validityType = data.validityType ?? owned.validityType
    const customExpiryDate = 'expiryDate' in b ? parseDate(b.expiryDate) : owned.expiryDate
    if (validityType === 'custom' && !customExpiryDate) return NextResponse.json({ error: 'Custom referrals need an expiry date' }, { status: 400 })
    data.expiryDate = calculateReferralExpiry(issueDate, validityType, customExpiryDate)
  }
  const updated = await prisma.referral.update({ where: { id }, data })
  return NextResponse.json(updated)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params
  await prisma.referral.deleteMany({ where: { id, userId } })
  return NextResponse.json({ ok: true })
}
