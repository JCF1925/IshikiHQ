export const dynamic = 'force-dynamic'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { apiError, apiSuccess } from '@/lib/api'
import { requireRedbarkGates } from '@/lib/redbark-service'

export async function GET() {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const userId = (session.user as any).id
  return apiSuccess({ connections: await prisma.redbarkConnection.findMany({
    where: { userId },
    select: {
      id: true, providerConnectionId: true, status: true, apiVersion: true, sandboxOnly: true,
      lastSyncedAt: true, lastError: true, disconnectedAt: true, createdAt: true,
      consents: true, accounts: { select: { id: true, providerName: true, providerType: true, providerCurrency: true } },
      jobs: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  }) })
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const userId = (session.user as any).id
  let gates: Record<string, string>
  try { gates = await requireRedbarkGates(userId) } catch (error: any) {
    return apiError('PROVIDER_GATES_CLOSED', error.message, 412)
  }
  const body = await request.json()
  if (body.sandboxOnly !== true || typeof body.credentialReference !== 'string' || !body.credentialReference.trim()) {
    return apiError('VALIDATION_ERROR', 'Sandbox mode and a server-side credential reference are required', 400)
  }
  if (body.apiVersion !== gates.api_version) return apiError('PROVIDER_GATES_CLOSED', 'API version does not match attestation', 412)
  const consentExpiry = new Date(body.consentExpiresAt)
  if (!body.providerConsentId || !body.providerConnectionId || Number.isNaN(consentExpiry.getTime()) || consentExpiry <= new Date()) {
    return apiError('VALIDATION_ERROR', 'Active provider connection and consent details are required', 400)
  }
  const connection = await prisma.redbarkConnection.create({
    data: {
      userId, providerConnectionId: body.providerConnectionId,
      credentialReference: body.credentialReference, status: 'active',
      apiVersion: body.apiVersion, sandboxOnly: true,
      consents: { create: {
        providerConsentId: body.providerConsentId, scopes: Array.isArray(body.scopes) ? body.scopes : [],
        grantedAt: new Date(), expiresAt: consentExpiry,
      } },
    },
    select: { id: true, status: true, apiVersion: true, sandboxOnly: true, createdAt: true },
  })
  return apiSuccess({ connection }, { status: 201 })
}