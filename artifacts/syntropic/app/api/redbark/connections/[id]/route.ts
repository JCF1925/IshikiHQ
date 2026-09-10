export const dynamic = 'force-dynamic'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { apiError, apiSuccess } from '@/lib/api'
import { getRedbarkAdapter } from '@/lib/redbark-provider'
import { requireRedbarkGates } from '@/lib/redbark-service'

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const userId = (session.user as any).id
  const { id } = await params
  const connection = await prisma.redbarkConnection.findFirst({ where: { id, userId } })
  if (!connection) return apiError('NOT_FOUND', 'Connection not found', 404)
  if (connection.status === 'disconnected') return apiSuccess({ disconnected: true })
  try {
    const gates = await requireRedbarkGates(userId)
    if (!connection.providerConnectionId || !connection.credentialReference || !connection.apiVersion) throw new Error('Connection contract is incomplete')
    await getRedbarkAdapter({
      apiVersion: connection.apiVersion, sandbox: true, gateValues: gates,
      credentialReference: connection.credentialReference,
    }).revokeConnection(connection.providerConnectionId)
  } catch (error: any) {
    return apiError('DISCONNECT_FAILED', `Provider revocation failed; credentials retained for retry: ${error.message}`, 503)
  }
  await prisma.$transaction([
    prisma.redbarkConsent.updateMany({ where: { connectionId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
    prisma.redbarkSyncJob.updateMany({ where: { connectionId: id, status: { in: ['queued', 'running', 'retrying'] } }, data: { status: 'cancelled', completedAt: new Date() } }),
    prisma.redbarkConnection.update({
      where: { id }, data: { status: 'disconnected', credentialReference: null, disconnectedAt: new Date() },
    }),
  ])
  return apiSuccess({ disconnected: true })
}