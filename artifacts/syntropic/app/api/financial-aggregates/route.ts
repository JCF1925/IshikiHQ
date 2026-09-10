export const dynamic = 'force-dynamic'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { apiError, apiSuccess } from '@/lib/api'
import { rebuildFinancialAggregates } from '@/lib/financial-aggregates'

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const userId = (session.user as any).id
  const url = new URL(request.url)
  const snapshots = await prisma.financialAggregateSnapshot.findMany({
    where: { userId, ...(url.searchParams.get('dimension') ? { dimension: url.searchParams.get('dimension')! } : {}) },
    include: url.searchParams.get('drillThrough') === 'true' ? {
      sources: { include: { transaction: true, sourceTransaction: { include: { observations: { orderBy: { receivedAt: 'asc' } } } } } },
    } : undefined,
    orderBy: [{ periodStart: 'desc' }, { dimension: 'asc' }, { dimensionValue: 'asc' }],
  })
  return apiSuccess({ snapshots })
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const userId = (session.user as any).id
  const body = await request.json()
  const periodStart = new Date(body.periodStart)
  const periodEnd = new Date(body.periodEnd)
  if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime()) || periodEnd <= periodStart) {
    return apiError('VALIDATION_ERROR', 'Valid period start and end are required', 400)
  }
  return apiSuccess({ rebuilt: await rebuildFinancialAggregates(userId, periodStart, periodEnd) })
}