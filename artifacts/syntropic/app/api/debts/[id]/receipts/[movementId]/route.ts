export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { getFileUrl } from '@/lib/s3'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; movementId: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = (session.user as { id?: string }).id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, movementId } = await params
  const movement = await prisma.debtMovement.findFirst({
    where: {
      id: movementId,
      agreementId: id,
      agreement: { userId },
    },
    include: {
      sourceTransaction: { select: { receiptPath: true, receiptIsPublic: true } },
      householdExpense: { select: { linkedTransaction: { select: { receiptPath: true, receiptIsPublic: true } } } },
    },
  })
  if (!movement) return NextResponse.json({ error: 'Debt movement not found' }, { status: 404 })

  const receipt = movement.sourceTransaction
    ?? movement.householdExpense?.linkedTransaction
  if (!receipt?.receiptPath) return NextResponse.json({ error: 'No receipt is attached' }, { status: 404 })

  // Receipts remain private even when reached from a shared debt history. The
  // ownership check above is the authorization boundary; S3 receives only the
  // short-lived URL request.
  const url = await getFileUrl(receipt.receiptPath, 'application/octet-stream', receipt.receiptIsPublic, 300)
  return NextResponse.json({ url, expiresInSeconds: 300 })
}