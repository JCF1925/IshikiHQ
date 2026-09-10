export const dynamic = 'force-dynamic'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { apiError, apiSuccess } from '@/lib/api'

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const userId = (session.user as any).id
  const { id } = await params
  const { action } = await request.json()
  if (!['accept', 'reject'].includes(action)) return apiError('VALIDATION_ERROR', 'Invalid decision', 400)
  const current = await prisma.forwardedMessageCandidate.findFirst({ where: { id, userId, status: 'pending' } })
  if (!current) return apiError('NOT_FOUND', 'Pending candidate not found', 404)
  const candidate = await prisma.forwardedMessageCandidate.update({
    where: { id }, data: action === 'accept'
      ? { status: 'accepted', acceptedAt: new Date() }
      : { status: 'rejected', rejectedAt: new Date() },
  })
  // Acceptance records consent to the proposed action; execution remains a separate explicit flow.
  return apiSuccess({ candidate })
}