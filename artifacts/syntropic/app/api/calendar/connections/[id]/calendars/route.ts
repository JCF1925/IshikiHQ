export const dynamic = 'force-dynamic'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { apiError, apiSuccess } from '@/lib/api'
import { providerForConnection } from '@/lib/calendar-server'
import { CalendarProviderError, type ProviderCalendar } from '@/lib/calendar-provider'
import {
  CALENDAR_CONNECTION_ERROR_CONTRACT,
  CALENDAR_PERMISSION_ERROR_CONTRACT,
  calendarProviderErrorContract,
  logCalendarFailure,
  stagingCalendarRecoveryFailure,
} from '@/lib/calendar-oauth-server'

function publicCalendar(calendar: ProviderCalendar) {
  const { id, name, primary, accessRole } = calendar
  return {
    id,
    name,
    ...(primary === undefined ? {} : { primary }),
    ...(accessRole === undefined ? {} : { accessRole }),
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) {
    const error = CALENDAR_CONNECTION_ERROR_CONTRACT.unauthorized
    return apiError(error.code, error.message, error.status)
  }
  const { id } = await params
  const connection = await prisma.calendarProviderConnection.findFirst({ where: { id, userId: (session.user as any).id } })
  if (!connection) return apiError('NOT_FOUND', 'Calendar connection not found', 404)
  try {
    const stagedFailure = stagingCalendarRecoveryFailure(_req, 'list-calendars')
    if (stagedFailure) throw stagedFailure
    const provider = await providerForConnection(id)
    if (!provider) {
      const error = calendarProviderErrorContract(401)
      return apiError(error.code, error.message, error.status, error.details)
    }
    const calendars = await provider.listCalendars()
    return apiSuccess({ calendars: calendars.map(publicCalendar) })
  } catch (error) {
    const providerError = error instanceof CalendarProviderError ? error : undefined
    const contract = calendarProviderErrorContract(providerError?.status, providerError?.retryAfter)
    if (providerError?.status === 401) {
      const safeError = CALENDAR_PERMISSION_ERROR_CONTRACT.accessRevoked
      await prisma.calendarProviderConnection.update({
        where: { id },
        data: { status: 'disabled', disconnectedAt: new Date(), lastSyncError: safeError.message },
      })
      return apiError(safeError.code, safeError.message, safeError.status, safeError.details)
    }
    logCalendarFailure('list-calendars', error)
    return apiError(contract.code, contract.message, contract.status, contract.details)
  }
}
