export const dynamic = 'force-dynamic'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { apiError, apiSuccess } from '@/lib/api'
import { requireRedbarkGates, runRedbarkSyncJob } from '@/lib/redbark-service'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const userId = (session.user as any).id
  try { await requireRedbarkGates(userId) } catch (error: any) {
    return apiError('PROVIDER_GATES_CLOSED', error.message, 412)
  }
  const { id } = await params
  const body = await request.json()
  if (typeof body.idempotencyKey !== 'string' || !body.idempotencyKey.trim()) return apiError('VALIDATION_ERROR', 'Idempotency key required', 400)
  const connection = await prisma.redbarkConnection.findFirst({
    where: { id, userId, status: { in: ['active', 'outage'] } }, include: { consents: { where: { revokedAt: null }, orderBy: { expiresAt: 'desc' }, take: 1 } },
  })
  if (!connection) return apiError('NOT_FOUND', 'Active connection not found', 404)
  const consent = connection.consents[0]
  if (!consent || consent.expiresAt <= new Date()) {
    await prisma.redbarkConnection.update({ where: { id }, data: { status: 'consent_expired' } })
    return apiError('CONSENT_EXPIRED', 'Redbark consent has expired', 412)
  }
  const job = await prisma.redbarkSyncJob.upsert({
    where: { connectionId_idempotencyKey: { connectionId: id, idempotencyKey: body.idempotencyKey.trim() } },
    create: { connectionId: id, idempotencyKey: body.idempotencyKey.trim(), consentExpiresAt: consent.expiresAt },
    update: {},
  })
  // The durable job row is claimed before adapter work; a process failure
  // leaves observable state for the background worker/this idempotent route.
  await runRedbarkSyncJob({ userId, connectionId: id, jobId: job.id })
  const updated = await prisma.redbarkSyncJob.findUniqueOrThrow({ where: { id: job.id } })
  return apiSuccess({ job: updated }, { status: updated.status === 'succeeded' ? 200 : 202 })
}