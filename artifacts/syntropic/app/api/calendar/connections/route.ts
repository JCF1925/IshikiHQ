export const dynamic = 'force-dynamic'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { apiError, apiSuccess, parseBody } from '@/lib/api'
import { z } from 'zod'
import {
  CALENDAR_CONNECTION_ERROR_CONTRACT,
  connectGoogleCalendarAccount,
  publicCalendarConnection,
} from '@/lib/calendar-oauth-server'

const createSchema = z.object({ provider: z.literal('google'), providerAccountId: z.string().trim().min(1).max(255).optional(), displayName: z.string().trim().max(255).optional() })
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    const error = CALENDAR_CONNECTION_ERROR_CONTRACT.unauthorized
    return apiError(error.code, error.message, error.status)
  }
  const rows = await prisma.calendarProviderConnection.findMany({ where: { userId: (session.user as any).id }, include: { settings: true }, orderBy: { createdAt: 'desc' } })
  return apiSuccess(rows.map(publicCalendarConnection))
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    const error = CALENDAR_CONNECTION_ERROR_CONTRACT.unauthorized
    return apiError(error.code, error.message, error.status)
  }
  const parsed = await parseBody(request, createSchema)
  if (!parsed.success) return parsed.response
  const userId = (session.user as any).id
  const connection = await connectGoogleCalendarAccount(userId, {
    requestedAccountId: parsed.data.providerAccountId,
    displayName: parsed.data.displayName,
  })
  if (!connection) {
    const error = CALENDAR_CONNECTION_ERROR_CONTRACT.missingGrant
    return apiError(error.code, error.message, error.status, error.details)
  }
  return apiSuccess(publicCalendarConnection(connection), { status: 201 })
}
