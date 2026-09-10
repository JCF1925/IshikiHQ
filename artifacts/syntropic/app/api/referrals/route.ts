export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { calculateReferralExpiry, evaluateReferral } from '@/lib/referrals'

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

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const referrals = await prisma.referral.findMany({
    where: { userId },
    include: {
      practitioner: { select: { id: true, name: true, role: true, isActive: true, organisation: { select: { name: true } } } },
      referrer: { select: { id: true, name: true } },
      condition: { select: { id: true, name: true } },
      usages: { where: { status: 'counted' }, select: { serviceDate: true, status: true } },
    },
    orderBy: { issueDate: 'desc' },
  })
  const enriched = referrals.map((r) => {
    const evaluation = evaluateReferral(r, true, new Date(), r.practitionerId, r.usages)
    const expiryDate = calculateReferralExpiry(r.issueDate, r.validityType, r.expiryDate)
    return {
      ...r,
      expiryDate,
      appointmentsUsed: evaluation.usageCount,
      expired: evaluation.code === 'expired',
      notYetValid: evaluation.code === 'not_yet_valid',
      remaining: evaluation.remaining,
      exhausted: evaluation.code === 'exhausted',
      status: evaluation.code,
      statusMessage: evaluation.message,
      renewalReminderEligible: evaluation.renewalReminderEligible && Boolean(r.practitioner?.isActive),
      renewalReminder: evaluation.renewalReminder && Boolean(r.practitioner?.isActive),
    }
  })
  return NextResponse.json(enriched)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const b = await request.json()
  const practitioner = await prisma.person.findFirst({ where: { id: b.practitionerId, userId, type: 'practitioner' }, select: { id: true } })
  if (!practitioner) return NextResponse.json({ error: 'Practitioner not found' }, { status: 400 })
  if (b.referrerId) {
    const referrer = await prisma.person.findFirst({ where: { id: b.referrerId, userId }, select: { id: true } })
    if (!referrer) return NextResponse.json({ error: 'Referring doctor not found' }, { status: 400 })
  }
  if (b.conditionId) {
    const condition = await prisma.healthCondition.findFirst({ where: { id: b.conditionId, userId }, select: { id: true } })
    if (!condition) return NextResponse.json({ error: 'Condition not found' }, { status: 400 })
  }
  const issueDate = parseDate(b.issueDate, new Date()) ?? new Date()
  const validityType = VALIDITY_TYPES.has(b.validityType) ? b.validityType : 'custom'
  const customExpiryDate = parseDate(b.expiryDate)
  if (validityType === 'custom' && !customExpiryDate) return NextResponse.json({ error: 'Custom referrals need an expiry date' }, { status: 400 })
  const appointmentLimit = parseLimit(b.appointmentLimit)
  const serviceLimitPeriod = appointmentLimit == null ? null : (SERVICE_LIMIT_PERIODS.has(b.serviceLimitPeriod) ? b.serviceLimitPeriod : 'calendar_year')
  const expiryDate = calculateReferralExpiry(issueDate, validityType, customExpiryDate)
  const referral = await prisma.referral.create({
    data: {
      userId,
      practitionerId: b.practitionerId,
      referrerId: b.referrerId || null,
      conditionId: b.conditionId || null,
      issueDate,
      expiryDate,
      validityType,
      appointmentLimit,
      serviceLimitPeriod,
      reason: b.reason || null,
      notes: b.notes || null,
    },
  })
  return NextResponse.json(referral, { status: 201 })
}
