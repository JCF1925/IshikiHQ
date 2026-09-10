export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { apiError, parseBody, validationDetails } from '@/lib/api'
import { incomeSourceCreateSchema, incomeSourceUpdateSchema } from '@/lib/validation'

function incomeFailure(action: 'save' | 'delete', error: unknown) {
  const diagnosticId = randomUUID()
  console.error(`[income] ${action} failed`, {
    diagnosticId,
    error: error instanceof Error ? error.name : 'unknown',
  })
  return apiError('INTERNAL_ERROR', action === 'delete' ? 'Income source could not be deleted. Try again.' : 'Income source could not be saved. Check the fields and try again.', 500, { diagnosticId })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params
  const parsed = await parseBody(request, incomeSourceUpdateSchema)
  if (!parsed.success) return parsed.response
  const body = parsed.data

  const existing = await prisma.incomeSource.findFirst({ where: { id, userId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const candidate = {
    name: body.name ?? existing.name,
    type: body.type ?? existing.type,
    employerId: body.employerId !== undefined ? body.employerId : existing.employerId,
    amount: body.amount ?? existing.amount,
    frequency: body.frequency ?? existing.frequency,
    hoursPerWeek: body.hoursPerWeek !== undefined ? body.hoursPerWeek : existing.hoursPerWeek,
    isGross: body.isGross ?? existing.isGross,
    incSuper: body.incSuper ?? existing.incSuper,
    superRate: body.superRate ?? existing.superRate,
    payAccountId: body.payAccountId !== undefined ? body.payAccountId : existing.payAccountId,
    startDate: body.startDate ?? existing.startDate,
    endDate: body.endDate !== undefined ? body.endDate : existing.endDate,
    isActive: body.isActive ?? existing.isActive,
    notes: body.notes !== undefined ? body.notes : existing.notes,
    annualPackageAmount: body.annualPackageAmount !== undefined ? body.annualPackageAmount : existing.annualPackageAmount,
    payFrequency: body.payFrequency !== undefined ? body.payFrequency : existing.payFrequency,
    firstPayDate: body.firstPayDate !== undefined ? body.firstPayDate : existing.firstPayDate,
    payEndDate: body.payEndDate !== undefined ? body.payEndDate : existing.payEndDate,
    retainPayHistory: body.retainPayHistory !== undefined ? body.retainPayHistory : existing.retainPayHistory,
  }
  const validated = incomeSourceCreateSchema.safeParse(candidate)
  if (!validated.success) {
    return apiError('VALIDATION_ERROR', 'Please correct the income details before saving.', 400, validationDetails(validated.error))
  }

  try {
    const [employer, account] = await Promise.all([
      validated.data.employerId ? prisma.organisation.findFirst({ where: { id: validated.data.employerId, userId }, select: { id: true } }) : null,
      validated.data.payAccountId ? prisma.finAccount.findFirst({ where: { id: validated.data.payAccountId, userId }, select: { id: true } }) : null,
    ])
    if (validated.data.employerId && !employer) {
      return apiError('VALIDATION_ERROR', 'Employer is no longer available. Choose another employer.', 400, [{ field: 'employerId', message: 'Employer is not owned by this account' }])
    }
    if (validated.data.payAccountId && !account) {
      return apiError('VALIDATION_ERROR', 'Pay account is no longer available. Choose another account.', 400, [{ field: 'payAccountId', message: 'Pay account is not owned by this account' }])
    }

    const updated = await prisma.incomeSource.update({
      where: { id },
      data: {
        ...validated.data,
        employerId: validated.data.employerId ?? null,
        hoursPerWeek: validated.data.hoursPerWeek ?? null,
        payAccountId: validated.data.payAccountId ?? null,
        endDate: validated.data.endDate ?? null,
        notes: validated.data.notes ?? null,
      },
    })
    return NextResponse.json(updated)
  } catch (error) {
    return incomeFailure('save', error)
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params
  const existing = await prisma.incomeSource.findFirst({ where: { id, userId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  try {
    await prisma.incomeSource.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return incomeFailure('delete', error)
  }
}
