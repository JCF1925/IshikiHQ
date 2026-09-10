export const dynamic = 'force-dynamic'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { apiError, apiSuccess } from '@/lib/api'
import { disableCalendarConnectionLocally, providerForConnection } from '@/lib/calendar-server'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const { id } = await params
  const connection = await prisma.calendarProviderConnection.findFirst({ where: { id, userId: (session.user as any).id } })
  if (!connection) return apiError('NOT_FOUND', 'Calendar connection not found', 404)
  // Revocation is best-effort: a disconnected account must remain safely disabled
  // even if Google is currently unavailable.
  let revokeError: string | undefined
  try { await (await providerForConnection(id))?.revoke() } catch { revokeError = 'Remote token revocation could not be confirmed' }
  // Clear local OAuth material regardless of remote availability; reconnect is
  // required before this connection can make another provider request.
  await disableCalendarConnectionLocally(connection, 'Calendar provider disconnected', revokeError ?? null)
  return apiSuccess({ disconnected: true, ...(revokeError ? { warning: revokeError } : {}) })
}