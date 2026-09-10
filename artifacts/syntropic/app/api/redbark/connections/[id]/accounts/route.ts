export const dynamic = 'force-dynamic'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { apiError, apiSuccess } from '@/lib/api'
import { requireRedbarkGates } from '@/lib/redbark-service'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const userId = (session.user as any).id
  try { await requireRedbarkGates(userId) } catch (error: any) { return apiError('PROVIDER_GATES_CLOSED', error.message, 412) }
  const { id } = await params
  const body = await request.json()
  const connection = await prisma.redbarkConnection.findFirst({ where: { id, userId, status: 'active' } })
  if (!connection) return apiError('NOT_FOUND', 'Active connection not found', 404)
  if (typeof body.providerAccountId !== 'string' || !body.rawAccount || typeof body.rawAccount !== 'object') {
    return apiError('VALIDATION_ERROR', 'Provider account ID and raw provider value are required', 400)
  }
  if (body.finAccountId) {
    const owned = await prisma.finAccount.findFirst({ where: { id: body.finAccountId, userId } })
    if (!owned) return apiError('NOT_FOUND', 'Financial account not found', 404)
  }
  const account = await prisma.redbarkAccount.upsert({
    where: { connectionId_providerAccountId: { connectionId: id, providerAccountId: body.providerAccountId } },
    create: {
      connectionId: id, providerAccountId: body.providerAccountId, finAccountId: body.finAccountId ?? null,
      rawAccount: body.rawAccount, providerName: body.name, providerType: body.type,
      providerCurrency: body.currency, providerBalance: body.balance == null ? null : String(body.balance),
    },
    update: {
      finAccountId: body.finAccountId ?? undefined, rawAccount: body.rawAccount,
      providerName: body.name, providerType: body.type, providerCurrency: body.currency,
      providerBalance: body.balance == null ? undefined : String(body.balance),
    },
  })
  return apiSuccess({ account }, { status: 201 })
}