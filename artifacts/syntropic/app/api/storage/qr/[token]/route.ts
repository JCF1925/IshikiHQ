export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { hashStorageQrToken, HouseholdAccessError, requireHouseholdCapability } from '@/lib/household'

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  // Authentication deliberately precedes token hashing/database lookup so the
  // endpoint never discloses whether a token exists to an anonymous caller.
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { token } = await params
    const reference = await prisma.householdStorageQrReference.findUnique({
      where: { tokenHash: hashStorageQrToken(token) },
      select: {
        householdId: true,
        item: { include: { location: true, container: true, labels: { orderBy: { value: 'asc' } } } },
        container: { include: { location: true } },
      },
    })
    if (!reference) throw new HouseholdAccessError('QR reference not found', 404)
    try {
      await requireHouseholdCapability((session.user as any).id, reference.householdId, 'read')
    } catch {
      // A valid reference in another household is indistinguishable from an
      // unknown reference, including for removed members.
      throw new HouseholdAccessError('QR reference not found', 404)
    }
    if (reference.item) return NextResponse.json({ type: 'item', item: reference.item, location: reference.item.location, container: reference.item.container })
    if (reference.container) return NextResponse.json({ type: 'container', container: reference.container, location: reference.container.location })
    throw new HouseholdAccessError('QR reference not found', 404)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid request' }, { status: error instanceof HouseholdAccessError ? error.status : 400 })
  }
}