export const dynamic = 'force-dynamic'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { apiError, apiSuccess } from '@/lib/api'
import { REDBARK_REQUIRED_GATES } from '@/lib/automation-beta'

export async function GET() {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const userId = (session.user as any).id
  const attestations = await prisma.redbarkGateAttestation.findMany({ where: { userId } })
  return apiSuccess({ required: REDBARK_REQUIRED_GATES, attestations })
}

export async function PUT(request: Request) {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const userId = (session.user as any).id
  const body = await request.json()
  if (!REDBARK_REQUIRED_GATES.includes(body.gate) || body.confirmed !== true ||
      typeof body.contractValue !== 'string' || !body.contractValue.trim() ||
      typeof body.evidence !== 'string' || !body.evidence.trim()) {
    return apiError('VALIDATION_ERROR', 'Gate requires explicit confirmation, contract value, and evidence', 400)
  }
  const attestation = await prisma.redbarkGateAttestation.upsert({
    where: { userId_gate: { userId, gate: body.gate } },
    create: {
      userId, gate: body.gate, confirmed: true, contractValue: body.contractValue.trim(),
      evidence: body.evidence.trim(), confirmedAt: new Date(),
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    },
    update: {
      confirmed: true, contractValue: body.contractValue.trim(), evidence: body.evidence.trim(),
      confirmedAt: new Date(), expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    },
  })
  return apiSuccess({ attestation })
}