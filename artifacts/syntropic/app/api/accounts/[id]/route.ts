export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { materialiseDueTransactionLocks } from '@/lib/financial-truth'
import { apiError, apiSuccess, parseBody } from '@/lib/api'
import { accountUpdateSchema } from '@/lib/validation'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const userId = (session.user as any).id
  const { id } = await params
  const parsed = await parseBody(req, accountUpdateSchema)
  if (!parsed.success) return parsed.response
  const body = parsed.data

  const result = await prisma.finAccount.updateMany({
    where: { id, userId },
    data: {
      name: body.name,
      type: body.type,
      bsb: body.bsb,
      accountNumber: body.accountNumber,
      openingBalance: body.openingBalance,
      institution: body.institution,
      isActive: body.isActive,
      notes: body.notes,
    },
  })
  if (!result.count) return apiError('NOT_FOUND', 'Account not found', 404)
  return apiSuccess({ success: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const userId = (session.user as any).id
  const { id } = await params

  await materialiseDueTransactionLocks(userId)
  const lockedTransactions = await prisma.transaction.count({ where: { accountId: id, userId, status: 'locked' } })
  if (lockedTransactions) {
    return NextResponse.json({ error: 'This account has locked transactions and cannot be deleted.' }, { status: 423 })
  }
  // Detach transactions from the account rather than deleting them (retain history)
  const account = await prisma.finAccount.findFirst({ where: { id, userId }, select: { id: true } })
  if (!account) return apiError('NOT_FOUND', 'Account not found', 404)
  await prisma.$transaction([
    prisma.transaction.updateMany({ where: { accountId: id, userId }, data: { accountId: null } }),
    prisma.finAccount.delete({ where: { id } }),
  ])
  return apiSuccess({ success: true })
}
