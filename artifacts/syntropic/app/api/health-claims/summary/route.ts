export const dynamic = 'force-dynamic'

import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { apiError, apiSuccess } from '@/lib/api'
import { healthClaimReportScope } from '@/lib/account-security'

const currentYear = () => new Date().getUTCFullYear()

function requestedYear(request: Request) {
  const value = new URL(request.url).searchParams.get('year')
  if (value == null || value === '') return currentYear()
  const year = Number(value)
  return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : null
}

const roundMoney = (value: number) => Math.round(value * 100) / 100

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const userId = (session.user as { id?: string }).id
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  const year = requestedYear(request)
  if (year == null) return apiError('VALIDATION_ERROR', 'Year must be between 2000 and 2100', 400)

  const yearStart = new Date(Date.UTC(year, 0, 1))
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1))
  const scope = healthClaimReportScope(userId)

  // Confirmed claims remain live records after a source file is removed. The
  // report therefore scopes claim and policy rows by owner, while this live
  // import query is limited to safe source counts. Detached imports and their
  // retained audit metadata are never read into the report.
  const liveImports = await prisma.healthClaimImport.findMany({
    where: scope.liveImport,
    select: { id: true, kind: true },
  })

  const [medicareClaims, policies] = await Promise.all([
    prisma.medicareClaim.findMany({
      where: {
        ...scope.owner,
        serviceDate: { gte: yearStart, lt: yearEnd },
      },
      select: {
        id: true,
        serviceDate: true,
        description: true,
        provider: true,
        feeCharged: true,
        benefitPaid: true,
        outOfPocket: true,
        isForecast: true,
      },
      orderBy: { serviceDate: 'desc' },
    }),
    prisma.phiPolicy.findMany({
      where: scope.owner,
      select: {
        id: true,
        policyName: true,
        coverType: true,
        isActive: true,
        insurer: { select: { name: true } },
        transactions: {
          where: { userId, date: { gte: yearStart, lt: yearEnd } },
          select: { type: true, amount: true },
        },
        claims: {
          where: {
            userId,
            serviceDate: { gte: yearStart, lt: yearEnd },
          },
          select: {
            id: true,
            serviceDate: true,
            description: true,
            provider: true,
            chargedAmount: true,
            benefitAmount: true,
            outOfPocket: true,
          },
          orderBy: { serviceDate: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  const medicareActual = medicareClaims.filter((claim) => !claim.isForecast)
  const medicareForecast = medicareClaims.filter((claim) => claim.isForecast)
  const medicare = {
    claimCount: medicareClaims.length,
    actualClaimCount: medicareActual.length,
    forecastClaimCount: medicareForecast.length,
    chargedAmount: roundMoney(medicareClaims.reduce((sum, claim) => sum + (claim.feeCharged ?? 0), 0)),
    benefitAmount: roundMoney(medicareClaims.reduce((sum, claim) => sum + (claim.benefitPaid ?? 0), 0)),
    outOfPocket: roundMoney(medicareClaims.reduce((sum, claim) => sum + (claim.outOfPocket ?? 0), 0)),
    forecastOutOfPocket: roundMoney(medicareForecast.reduce((sum, claim) => sum + (claim.outOfPocket ?? 0), 0)),
    recentClaims: medicareClaims.slice(0, 8),
  }

  const privateClaims = policies.flatMap((policy) => policy.claims)
  const privateTransactions = policies.flatMap((policy) => policy.transactions)
  const privateBenefits = privateTransactions
    .filter((transaction) => transaction.type !== 'premium')
    .reduce((sum, transaction) => sum + transaction.amount, 0)
  const privatePremiums = privateTransactions
    .filter((transaction) => transaction.type === 'premium')
    .reduce((sum, transaction) => sum + transaction.amount, 0)
  const privateHealthSummary = {
    policyCount: policies.length,
    activePolicyCount: policies.filter((policy) => policy.isActive).length,
    claimCount: privateClaims.length,
    chargedAmount: roundMoney(privateClaims.reduce((sum, claim) => sum + (claim.chargedAmount ?? 0), 0)),
    benefitAmount: roundMoney(privateClaims.reduce((sum, claim) => sum + (claim.benefitAmount ?? 0), 0)),
    outOfPocket: roundMoney(privateClaims.reduce((sum, claim) => sum + (claim.outOfPocket ?? 0), 0)),
    premiumsPaid: roundMoney(privatePremiums),
    benefitsReceived: roundMoney(privateBenefits),
    effectiveCost: roundMoney(privatePremiums - privateBenefits),
    policies: policies.map((policy) => ({
      id: policy.id,
      policyName: policy.policyName,
      insurerName: policy.insurer?.name ?? null,
      coverType: policy.coverType,
      isActive: policy.isActive,
      claimCount: policy.claims.length,
      benefitAmount: roundMoney(policy.claims.reduce((sum, claim) => sum + (claim.benefitAmount ?? 0), 0)),
      effectiveCost: roundMoney(
        policy.transactions
          .filter((transaction) => transaction.type === 'premium')
          .reduce((sum, transaction) => sum + transaction.amount, 0)
        - policy.transactions
          .filter((transaction) => transaction.type !== 'premium')
          .reduce((sum, transaction) => sum + transaction.amount, 0),
      ),
    })),
    recentClaims: privateClaims
      .sort((left, right) => right.serviceDate.getTime() - left.serviceDate.getTime())
      .slice(0, 8),
  }

  return apiSuccess({
    year,
    generatedAt: new Date().toISOString(),
    scope: 'live',
    liveImportCount: liveImports.length,
    liveImportKinds: {
      medicare: liveImports.filter((item) => item.kind === 'medicare').length,
      privateHealth: liveImports.filter((item) => item.kind === 'private_health').length,
    },
    medicare,
    privateHealth: privateHealthSummary,
    combined: {
      claimCount: medicare.claimCount + privateHealthSummary.claimCount,
      benefitAmount: roundMoney(medicare.benefitAmount + privateHealthSummary.benefitAmount),
      outOfPocket: roundMoney(medicare.outOfPocket + privateHealthSummary.outOfPocket),
    },
  })
}