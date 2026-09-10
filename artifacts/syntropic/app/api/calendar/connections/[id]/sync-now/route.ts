export const dynamic = 'force-dynamic'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { apiError, apiSuccess } from '@/lib/api'
import { stableIdempotencyKey } from '@/lib/calendar-core'
import { executeCalendarSyncJob } from '@/lib/calendar-server'
import {
  CALENDAR_CONNECTION_ERROR_CONTRACT,
  CALENDAR_PERMISSION_ERROR_CONTRACT,
  calendarProviderErrorContract,
  logCalendarFailure,
  stagingCalendarRecoveryFailure,
} from '@/lib/calendar-oauth-server'

type PublicSyncResult = {
  succeeded?: boolean
  rescheduled?: boolean
  skipped?: boolean
  cancelled?: boolean
}

function publicSyncResult(result: Awaited<ReturnType<typeof executeCalendarSyncJob>>): PublicSyncResult {
  const safeResult: PublicSyncResult = {}
  if ('succeeded' in result) safeResult.succeeded = result.succeeded
  if ('rescheduled' in result) safeResult.rescheduled = result.rescheduled
  if ('skipped' in result) safeResult.skipped = result.skipped
  if ('cancelled' in result) safeResult.cancelled = result.cancelled
  return safeResult
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) {
    const error = CALENDAR_CONNECTION_ERROR_CONTRACT.unauthorized
    return apiError(error.code, error.message, error.status)
  }
  const { id } = await params
  const connection = await prisma.calendarProviderConnection.findFirst({ where: { id, userId: (session.user as any).id }, include: { settings: { where: { enabled: true } } } })
  if (!connection) return apiError('NOT_FOUND', 'Calendar connection not found', 404)
  if (connection.status === 'disabled' || connection.disconnectedAt) {
    const error = calendarProviderErrorContract(401)
    return apiError(error.code, error.message, error.status, error.details)
  }
  try {
    const stagedFailure = stagingCalendarRecoveryFailure(_request, 'sync-now')
    if (stagedFailure) throw stagedFailure
    const jobs = await Promise.all(connection.settings.map(setting => prisma.calendarSyncJob.create({
      data: { connectionId: id, externalCalendarId: setting.externalCalendarId, direction: setting.direction, idempotencyKey: stableIdempotencyKey(['manual-sync', id, setting.externalCalendarId, String(Date.now())]) },
      select: { id: true, externalCalendarId: true },
    })))
    const results = await Promise.all(jobs.map(job => executeCalendarSyncJob(job.id)))
    if (results.some(result => 'disabled' in result && result.disabled)) {
      const error = CALENDAR_PERMISSION_ERROR_CONTRACT.accessRevoked
      return apiError(error.code, error.message, error.status, error.details)
    }
    if (results.some(result => 'disconnected' in result && result.disconnected)) {
      const error = CALENDAR_PERMISSION_ERROR_CONTRACT.accessExpired
      return apiError(error.code, error.message, error.status, error.details)
    }
    if (results.some(result => 'succeeded' in result && result.succeeded === false)) {
      const error = calendarProviderErrorContract()
      return apiError(error.code, error.message, error.status, error.details)
    }
    return apiSuccess({
      queued: true,
      jobs: jobs.map(job => ({ id: job.id, externalCalendarId: job.externalCalendarId })),
      results: results.map(publicSyncResult),
    })
  } catch (error) {
    logCalendarFailure('sync-now', error)
    const contract = calendarProviderErrorContract()
    return apiError(contract.code, contract.message, contract.status, contract.details)
  }
}
