export const dynamic = 'force-dynamic'
import { auth } from '@/auth'
import { apiError, apiSuccess } from '@/lib/api'
import { prisma } from '@/lib/db'

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const days = Math.min(365, Math.max(1, Number(new URL(request.url).searchParams.get('days') ?? 45)))
  const now = new Date()
  const until = new Date(now.getTime() + days * 86_400_000)
  const periods = await prisma.studyTeachingPeriod.findMany({
    where: { program: { userId: (session.user as any).id }, OR: [{ censusDate: { gte: now, lte: until } }, { withdrawalDate: { gte: now, lte: until } }] },
    include: { program: { select: { id: true, name: true } } },
  })
  const alerts = periods.flatMap((period) => [
    ...(period.censusDate && period.censusDate >= now && period.censusDate <= until ? [{ kind: 'census', at: period.censusDate, periodId: period.id, period: period.name, program: period.program }] : []),
    ...(period.withdrawalDate && period.withdrawalDate >= now && period.withdrawalDate <= until ? [{ kind: 'withdrawal', at: period.withdrawalDate, periodId: period.id, period: period.name, program: period.program }] : []),
  ]).sort((a, b) => a.at.getTime() - b.at.getTime())
  return apiSuccess(alerts)
}
