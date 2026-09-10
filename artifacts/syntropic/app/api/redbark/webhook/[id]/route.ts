export const dynamic = 'force-dynamic'
import { prisma } from '@/lib/db'
import { apiError, apiSuccess } from '@/lib/api'
import { getRedbarkAdapter } from '@/lib/redbark-provider'
import { assertProviderTransaction, ingestRedbarkBatch, requireRedbarkGates } from '@/lib/redbark-service'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const connection = await prisma.redbarkConnection.findFirst({ where: { id, status: 'active' } })
  if (!connection?.credentialReference || !connection.apiVersion) return apiError('NOT_FOUND', 'Active connection not found', 404)
  let gates: Record<string, string>
  try { gates = await requireRedbarkGates(connection.userId) } catch (error: any) {
    return apiError('PROVIDER_GATES_CLOSED', error.message, 412)
  }
  const raw = new Uint8Array(await request.arrayBuffer())
  const adapter = getRedbarkAdapter({
    apiVersion: connection.apiVersion, sandbox: true, gateValues: gates,
    credentialReference: connection.credentialReference,
  })
  if (!await adapter.verifyWebhook(raw, request.headers)) return apiError('INVALID_SIGNATURE', 'Invalid webhook signature', 401)
  const events = await adapter.parseWebhook(raw)
  try {
    // Validate the complete signed batch before the transactional write.
    events.forEach((event) => assertProviderTransaction(event.transaction))
    await ingestRedbarkBatch({
      userId: connection.userId, connectionId: id,
      events: events.map((event) => ({ accountId: '', providerAccountId: event.providerAccountId, transaction: event.transaction })),
    })
  } catch (error: any) {
    return apiError(error?.message?.includes('unknown account') ? 'UNKNOWN_ACCOUNT' : 'VALIDATION_ERROR', error?.message ?? 'Webhook batch rejected', 409)
  }
  return apiSuccess({ accepted: events.length })
}