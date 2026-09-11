export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { apiError, apiSuccess, parseBody } from '@/lib/api'
import { getFileUrl, privateFileExists, verifyUploadedFile } from '@/lib/s3'
import { receiptAttachSchema } from '@/lib/validation'

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
      sourceTransaction: { select: { receiptPath: true } },
      householdExpense: { select: { linkedTransaction: { select: { receiptPath: true } } } },
    },
  })
  if (!movement) return NextResponse.json({ error: 'Debt movement not found' }, { status: 404 })

  const receipt = movement.sourceTransaction
    ?? movement.householdExpense?.linkedTransaction
  if (!receipt?.receiptPath) return NextResponse.json({ error: 'No receipt is attached' }, { status: 404 })

  // Receipts remain private even when reached from a shared debt history. The
  // ownership check above is the authorization boundary; S3 receives only the
  // short-lived URL request.
  try {
    if (!await privateFileExists(receipt.receiptPath)) {
      return NextResponse.json({ error: 'Receipt is no longer available' }, { status: 404 })
    }
    // Always issue a short-lived signed URL from this authenticated route. New
    // debt receipts are private, and this also avoids widening access when an
    // older transaction was marked public elsewhere.
    const url = await getFileUrl(receipt.receiptPath, 'application/octet-stream', false, 300)
    return NextResponse.json({ url, expiresInSeconds: 300 })
  } catch {
    // Missing or expired storage objects should not turn the debt history into
    // a server error or expose storage implementation details.
    return NextResponse.json({ error: 'Receipt is no longer available' }, { status: 404 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; movementId: string }> },
) {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const userId = (session.user as { id?: string }).id
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  const parsed = await parseBody(request, receiptAttachSchema)
  if (!parsed.success) return parsed.response
  const { id, movementId } = await params

  const movement = await prisma.debtMovement.findFirst({
    where: {
      id: movementId,
      agreementId: id,
      agreement: { userId },
    },
    include: {
      sourceTransaction: { select: { id: true, userId: true, receiptPath: true } },
      householdExpense: {
        select: {
          linkedTransaction: { select: { id: true, userId: true, receiptPath: true } },
        },
      },
    },
  })
  if (!movement) return apiError('NOT_FOUND', 'Debt movement not found', 404)

  const transaction = movement.sourceTransaction ?? movement.householdExpense?.linkedTransaction
  if (!transaction || transaction.userId !== userId) {
    return apiError('NOT_FOUND', 'A user-owned linked transaction is required before attaching a receipt', 404)
  }
  if (transaction.receiptPath) {
    return apiError('CONFLICT', 'This transaction already has a receipt attached', 409)
  }

  const upload = await prisma.genericUpload.findFirst({
    where: {
      id: parsed.data.uploadId,
      userId,
      status: 'prepared',
      expiresAt: { gt: new Date() },
    },
  })
  if (!upload) return apiError('NOT_FOUND', 'Upload is missing or expired', 404)

  const expectedChecksum = Buffer.from(upload.sha256, 'hex').toString('base64')
  try {
    if (!await verifyUploadedFile(upload.storageKey, upload.byteSize, expectedChecksum)) {
      return apiError('VALIDATION_ERROR', 'Uploaded bytes do not match the prepared receipt', 400)
    }
  } catch {
    return apiError('VALIDATION_ERROR', 'Uploaded receipt could not be verified', 400)
  }

  const attached = await prisma.$transaction(async (tx) => {
    const claimedUpload = await tx.genericUpload.updateMany({
      where: { id: upload.id, userId, status: 'prepared' },
      data: { status: 'attached' },
    })
    if (claimedUpload.count !== 1) return false

    const claimed = await tx.transaction.updateMany({
      where: { id: transaction.id, userId, receiptPath: null },
      data: { receiptPath: upload.storageKey, receiptIsPublic: false },
    })
    if (claimed.count !== 1) return false
    return true
  })
  if (!attached) return apiError('CONFLICT', 'This transaction changed while the receipt was attached', 409)

  return apiSuccess({ ok: true })
}