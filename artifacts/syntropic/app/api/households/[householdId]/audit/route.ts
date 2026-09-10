export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { HouseholdAccessError, requireHouseholdCapability } from '@/lib/household'

export async function GET(_request: Request, { params }: { params: Promise<{ householdId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { householdId } = await params
  try {
    await requireHouseholdCapability((session.user as any).id, householdId, 'read')
    return NextResponse.json(await prisma.householdAuditRecord.findMany({ where: { householdId }, orderBy: { createdAt: 'desc' }, take: 500 }))
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid request' }, { status: error instanceof HouseholdAccessError ? error.status : 400 }) }
}