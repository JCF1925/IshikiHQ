export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { hashStorageQrToken, requireHouseholdCapability } from '@/lib/household'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => null)
  const tokens = body?.tokens
  if (!Array.isArray(tokens) || tokens.length < 1 || tokens.length > 100 || tokens.some((token) => typeof token !== 'string' || !token)) {
    return NextResponse.json({ error: 'Provide between 1 and 100 label references' }, { status: 400 })
  }

  const references = await prisma.householdStorageQrReference.findMany({
    where: { tokenHash: { in: tokens.map(hashStorageQrToken) } },
    select: { tokenHash: true, householdId: true },
  })
  const readableHouseholds = new Map<string, boolean>()
  for (const householdId of new Set(references.map(({ householdId }) => householdId))) {
    readableHouseholds.set(
      householdId,
      await requireHouseholdCapability((session.user as any).id, householdId, 'read').then(() => true).catch(() => false),
    )
  }
  const validHashes = new Set(
    references
      .filter(({ householdId }) => readableHouseholds.get(householdId))
      .map(({ tokenHash }) => tokenHash),
  )
  const invalidIndexes = tokens
    .map((token, index) => validHashes.has(hashStorageQrToken(token)) ? null : index)
    .filter((index): index is number => index !== null)

  return NextResponse.json({ valid: invalidIndexes.length === 0, invalidIndexes })
}