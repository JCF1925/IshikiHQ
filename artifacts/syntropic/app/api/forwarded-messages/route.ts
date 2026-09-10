export const dynamic = 'force-dynamic'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { apiError, apiSuccess } from '@/lib/api'
import { classifyForwardedMessage } from '@/lib/automation-beta'

export async function GET() {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const userId = (session.user as any).id
  return apiSuccess({ candidates: await prisma.forwardedMessageCandidate.findMany({
    where: { userId }, orderBy: { createdAt: 'desc' }, take: 100,
  }) })
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const userId = (session.user as any).id
  const body = await request.json()
  if (body.explicitlyForwarded !== true || typeof body.messageId !== 'string' || typeof body.text !== 'string') {
    return apiError('VALIDATION_ERROR', 'An explicit user-forwarded payload is required; mailbox access is not supported', 400)
  }
  const candidate = classifyForwardedMessage(body)
  if (!candidate) return apiSuccess({ candidate: null })
  const stored = await prisma.forwardedMessageCandidate.upsert({
    where: { userId_idempotencyKey: { userId, idempotencyKey: body.messageId } },
    create: { userId, idempotencyKey: body.messageId, ...candidate },
    update: {},
  })
  return apiSuccess({ candidate: stored }, { status: 201 })
}