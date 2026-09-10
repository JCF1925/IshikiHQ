export const dynamic = "force-dynamic";
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { apiError, apiSuccess, parseBody } from '@/lib/api'
import { accountCreateSchema } from '@/lib/validation'
import { getDerivedAccountBalances, materialiseDueTransactionLocks } from '@/lib/financial-truth'

export async function GET() {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const userId = (session.user as any).id

  await materialiseDueTransactionLocks(userId)
  return apiSuccess(await getDerivedAccountBalances(userId))
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const userId = (session.user as any).id
  const parsed = await parseBody(request, accountCreateSchema)
  if (!parsed.success) return parsed.response
  const body = parsed.data
  const openingBalance = body.openingBalance ?? body.balance ?? 0

  const account = await prisma.finAccount.create({
    data: {
      userId,
      name: body.name,
      type: body.type ?? 'transaction',
      bsb: body.bsb ?? null,
      accountNumber: body.accountNumber ?? null,
      balance: openingBalance,
      openingBalance,
      institution: body.institution ?? null,
      notes: body.notes ?? null,
    },
  })
  return apiSuccess(account, { status: 201 })
}
