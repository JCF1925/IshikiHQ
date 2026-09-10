export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { materialiseDueTransactionLocks } from '@/lib/financial-truth'
import { normalizeMerchant } from '@/lib/automation-beta'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params
  const body = await req.json()
  await materialiseDueTransactionLocks(userId)
  const existing = await prisma.transaction.findFirst({ where: { id, userId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (body.action === 'confirm') {
    if (existing.status !== 'pending') return NextResponse.json({ error: 'Only pending transactions can be confirmed' }, { status: 409 })
    await prisma.$transaction(async (tx) => {
      await tx.transaction.update({ where: { id }, data: { status: 'confirmed', confirmedAt: new Date(), manuallyUnlocked: false } })
      await tx.transactionAuditRecord.create({ data: { userId, transactionId: id, action: 'confirmed', previousStatus: 'pending', nextStatus: 'confirmed' } })
      const priorExplicitCategory = await tx.categoryCorrection.findFirst({
        where: { userId, transactionId: id, explicitlyConfirmed: true },
        select: { id: true },
      })
      if (!priorExplicitCategory && existing.category && (existing.merchant || existing.description)) {
        await tx.categoryCorrection.create({
          data: {
            userId, transactionId: id,
            normalizedMerchant: normalizeMerchant(existing.merchant || existing.description),
            previousCategory: null, confirmedCategory: existing.category, explicitlyConfirmed: true,
          },
        })
      }
    })
    return NextResponse.json({ success: true })
  }
  if (body.action === 'lock' || body.action === 'relock') {
    if (existing.status !== 'confirmed') return NextResponse.json({ error: 'Only confirmed transactions can be locked' }, { status: 409 })
    await prisma.$transaction(async (tx) => {
      await tx.transaction.update({ where: { id }, data: { status: 'locked', lockedAt: new Date(), manuallyUnlocked: false } })
      await tx.transactionAuditRecord.create({ data: { userId, transactionId: id, action: 'locked', previousStatus: 'confirmed', nextStatus: 'locked', reason: body.reason ?? 'Manually locked' } })
    })
    return NextResponse.json({ success: true })
  }
  if (body.action === 'unlock') {
    if (existing.status !== 'locked') return NextResponse.json({ error: 'Only locked transactions can be unlocked' }, { status: 409 })
    if (typeof body.reason !== 'string' || !body.reason.trim()) return NextResponse.json({ error: 'An unlock reason is required for the audit trail' }, { status: 400 })
    await prisma.$transaction(async (tx) => {
      await tx.transaction.update({ where: { id }, data: { status: 'confirmed', lockedAt: null, manuallyUnlocked: true } })
      await tx.transactionAuditRecord.create({ data: { userId, transactionId: id, action: 'unlocked', previousStatus: 'locked', nextStatus: 'confirmed', reason: body.reason.trim() } })
    })
    return NextResponse.json({ success: true })
  }

  if (existing.status === 'locked') return NextResponse.json({ error: 'Transaction is locked. Unlock it before editing.' }, { status: 423 })
  if (body.status !== undefined) return NextResponse.json({ error: 'Use a lifecycle action to change transaction status' }, { status: 400 })
  if (body.accountId) {
    const account = await prisma.finAccount.findFirst({ where: { id: body.accountId, userId }, select: { id: true } })
    if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 400 })
  }
  const data = {
    date: body.date ? new Date(body.date) : undefined,
    amount: body.amount !== undefined ? parseFloat(body.amount) : undefined,
    merchant: body.merchant, description: body.description, category: body.category,
    subcategory: body.subcategory, accountId: body.accountId, isDeductible: body.isDeductible,
    taxCategory: body.taxCategory, isTransfer: body.isTransfer, isDishonoured: body.isDishonoured,
    tags: body.tags, notes: body.notes,
  }
  await prisma.$transaction(async (tx) => {
    await tx.transaction.update({ where: { id }, data })
    // A deliberate category edit supersedes even an auto-applied pending
    // suggestion, preventing stale evidence from reappearing in review.
    if (body.category !== undefined) {
      await tx.categorySuggestion.updateMany({
        where: { transactionId: id, userId, decision: 'pending' },
        data: { decision: 'superseded', decidedAt: new Date() },
      })
    }
    await tx.transactionAuditRecord.create({ data: { userId, transactionId: id, action: 'updated', previousStatus: existing.status, nextStatus: existing.status, changes: data } })
  })
  return NextResponse.json({ success: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params
  await materialiseDueTransactionLocks(userId)
  const existing = await prisma.transaction.findFirst({ where: { id, userId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.status === 'locked') return NextResponse.json({ error: 'Locked transactions cannot be deleted' }, { status: 423 })
  const immutableSource = await prisma.redbarkSourceTransaction.findFirst({ where: { transactionId: id }, select: { id: true } })
  if (immutableSource) return NextResponse.json({ error: 'Imported source transactions are immutable and cannot be deleted' }, { status: 409 })
  await prisma.$transaction(async (tx) => {
    await tx.transactionAuditRecord.create({ data: { userId, transactionId: id, action: 'deleted', previousStatus: existing.status, changes: { transaction: existing } } })
    await tx.transaction.delete({ where: { id } })
  })
  return NextResponse.json({ success: true })
}