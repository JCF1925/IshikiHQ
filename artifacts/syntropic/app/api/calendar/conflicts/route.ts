export const dynamic = 'force-dynamic'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { apiError, apiSuccess } from '@/lib/api'
import { calendarConflictSnapshotForDisplay } from '@/lib/calendar-core'
export async function GET() {
  const s = await auth(); if (!s?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const conflicts = await prisma.calendarSyncConflict.findMany({ where: { connection: { userId: (s.user as any).id }, resolvedAt: null }, include: { event: { select: { id: true, title: true } }, connection: { select: { id: true, provider: true, displayName: true } } }, orderBy: { detectedAt: 'desc' } })
  return apiSuccess({ conflicts: conflicts.map(conflict => ({
    id: conflict.id,
    detectedAt: conflict.detectedAt,
    event: { id: conflict.event.id, title: conflict.event.title },
    connection: { provider: conflict.connection.provider, displayName: conflict.connection.displayName },
    localSnapshot: calendarConflictSnapshotForDisplay(conflict.localVersion),
    providerSnapshot: calendarConflictSnapshotForDisplay(conflict.providerVersion),
  })) })
}