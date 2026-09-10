export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { healthClaimOwnerWhere } from '@/lib/account-security'
import { safetyNetProgress } from '@/lib/health'
import { evaluateReferral } from '@/lib/referrals'

const num = (v: any) => (v != null && v !== '' ? parseFloat(v) : null)

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const url = new URL(request.url)
  const year = parseInt(url.searchParams.get('year') || String(new Date().getUTCFullYear()))
  const concession = url.searchParams.get('concession') === 'true'

  const claims = await prisma.medicareClaim.findMany({ where: healthClaimOwnerWhere(userId), orderBy: { serviceDate: 'desc' } })
  const practitioners = await prisma.person.findMany({
    where: { userId, type: 'practitioner' },
    select: {
      id: true, name: true, referralRequired: true,
      referralsReceived: {
        where: { isActive: true },
        include: { usages: { where: { status: 'counted' }, select: { serviceDate: true, status: true } } },
      },
    },
  })
  const claimsWithReferral = claims.map((claim) => {
    const practitioner = practitioners.find((item) => item.name.trim().toLowerCase() === (claim.provider ?? '').trim().toLowerCase())
    if (!practitioner) return { ...claim, referralStatus: 'unmatched_provider', referralStatusMessage: null }
    const candidates = practitioner.referralsReceived.map((referral) => evaluateReferral(referral, practitioner.referralRequired, claim.serviceDate, practitioner.id, referral.usages))
    const evaluation = candidates.find((item) => item.eligible) ?? candidates[0] ?? evaluateReferral(null, practitioner.referralRequired, claim.serviceDate, practitioner.id)
    return { ...claim, referralStatus: evaluation.code, referralStatusMessage: evaluation.message, referralRequired: practitioner.referralRequired }
  })
  const yearStart = new Date(Date.UTC(year, 0, 1))
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1))
  const inYear = claims.filter((c) => c.serviceDate >= yearStart && c.serviceDate < yearEnd && c.countsToSafetyNet)
  const actual = inYear.filter((c) => !c.isForecast)
  const gapTotal = actual.reduce((s, c) => s + ((c.feeCharged || 0) - (c.benefitPaid || 0) > 0 ? (c.feeCharged || 0) - (c.benefitPaid || 0) : (c.outOfPocket || 0)), 0)
  const oopTotal = actual.reduce((s, c) => s + (c.outOfPocket || 0), 0)
  const forecastOop = inYear.filter((c) => c.isForecast).reduce((s, c) => s + (c.outOfPocket || 0), 0)

  const progress = safetyNetProgress(gapTotal, oopTotal, year, { concession })
  const progressWithForecast = safetyNetProgress(gapTotal, oopTotal + forecastOop, year, { concession })

  return NextResponse.json({ claims: claimsWithReferral, year, progress, progressWithForecast, forecastOop })
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const b = await request.json()
  const serviceDate = b.serviceDate ? new Date(b.serviceDate) : new Date()
  const fee = num(b.feeCharged)
  const benefit = num(b.benefitPaid)
  const oop = num(b.outOfPocket) ?? (fee != null && benefit != null ? Math.max(0, fee - benefit) : 0)
  const claim = await prisma.medicareClaim.create({
    data: {
      userId,
      serviceDate,
      description: b.description,
      itemNumber: b.itemNumber || null,
      provider: b.provider || null,
      scheduleFee: num(b.scheduleFee),
      feeCharged: fee,
      benefitPaid: benefit,
      outOfPocket: oop,
      financialYear: b.financialYear || null,
      countsToSafetyNet: b.countsToSafetyNet ?? true,
      isForecast: b.isForecast ?? false,
      notes: b.notes || null,
    },
  })
  return NextResponse.json(claim, { status: 201 })
}
