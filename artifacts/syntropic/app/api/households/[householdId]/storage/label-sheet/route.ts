export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import {
  HouseholdAccessError,
  requireHouseholdCapability,
} from '@/lib/household'
import { isStorageLabelLayoutId, normalizeStorageLabelLayoutId } from '@/lib/storage-label-layout'

const fail = (error: unknown) => NextResponse.json(
  { error: error instanceof Error ? error.message : 'Invalid request' },
  { status: error instanceof HouseholdAccessError ? error.status : 400 },
)

export async function GET(_request: Request, { params }: { params: Promise<{ householdId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { householdId } = await params

  try {
    await requireHouseholdCapability((session.user as any).id as string, householdId, 'read')
    const household = await prisma.household.findUnique({
      where: { id: householdId },
      select: { preferredStorageLabelLayout: true },
    })
    if (!household) throw new HouseholdAccessError('Household not found', 404)
    return NextResponse.json({ layoutId: normalizeStorageLabelLayoutId(household.preferredStorageLabelLayout) })
  } catch (error) {
    return fail(error)
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ householdId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id as string
  const { householdId } = await params

  try {
    await requireHouseholdCapability(userId, householdId, 'update')
    const body = await request.json().catch(() => null)
    const layoutId = body?.layoutId
    if (!isStorageLabelLayoutId(layoutId)) throw new Error('Choose a valid label sheet')

    const household = await prisma.household.update({
      where: { id: householdId },
      data: { preferredStorageLabelLayout: layoutId },
      select: { preferredStorageLabelLayout: true },
    })
    return NextResponse.json({ layoutId: normalizeStorageLabelLayoutId(household.preferredStorageLabelLayout) })
  } catch (error) {
    return fail(error)
  }
}