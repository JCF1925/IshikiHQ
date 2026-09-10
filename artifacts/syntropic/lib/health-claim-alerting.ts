import { sendOperationsAlert } from './operations-alerting'
import type { PrismaClient } from '@prisma/client'

const GROUPING_WINDOW_MS = 60_000
const GROUPING_KEY = 'health_claim_ownership_violation'

let ownershipViolationWindow = {
  startedAt: 0,
  count: 0,
}

type OwnershipAlertDatabase = Pick<PrismaClient, '$transaction'>

type OwnershipViolationGrouping = {
  groupedCount: number
  shouldEmit: boolean
}

export function isHealthClaimOwnershipViolation(error: unknown) {
  return error instanceof Error
    && /health claim import audit (?:user|actor) must match import owner/i.test(error.message)
}

async function recordSharedGrouping(
  database: OwnershipAlertDatabase,
): Promise<OwnershipViolationGrouping> {
  return database.$transaction(async (tx) => {
    // Serialize the fixed aggregate key across all application instances. The
    // lock and row contain no claim, request, credential, or record data.
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${GROUPING_KEY}, 0))
    `

    const [existing] = await tx.$queryRaw<Array<{
      windowStartedAt: Date
      count: number
    }>>`
      SELECT "windowStartedAt", "count"
      FROM "OperationsAlertGroup"
      WHERE "key" = ${GROUPING_KEY}
      FOR UPDATE
    `

    const now = new Date()
    if (!existing || now.getTime() - existing.windowStartedAt.getTime() >= GROUPING_WINDOW_MS) {
      await tx.$executeRaw`
        INSERT INTO "OperationsAlertGroup" ("key", "windowStartedAt", "count", "updatedAt")
        VALUES (${GROUPING_KEY}, ${now}, 1, ${now})
        ON CONFLICT ("key") DO UPDATE
        SET "windowStartedAt" = EXCLUDED."windowStartedAt",
            "count" = EXCLUDED."count",
            "updatedAt" = EXCLUDED."updatedAt"
      `
      return { groupedCount: 1, shouldEmit: true }
    }

    const nextCount = existing.count + 1
    await tx.$executeRaw`
      UPDATE "OperationsAlertGroup"
      SET "count" = ${nextCount}, "updatedAt" = ${now}
      WHERE "key" = ${GROUPING_KEY}
    `
    return { groupedCount: nextCount, shouldEmit: false }
  })
}

function recordProcessLocalGrouping(): OwnershipViolationGrouping {
  const now = Date.now()
  if (now - ownershipViolationWindow.startedAt >= GROUPING_WINDOW_MS) {
    ownershipViolationWindow = { startedAt: now, count: 0 }
  }
  ownershipViolationWindow.count += 1
  return {
    groupedCount: ownershipViolationWindow.count,
    shouldEmit: ownershipViolationWindow.count === 1,
  }
}

export async function reportHealthClaimOwnershipViolation(
  database?: OwnershipAlertDatabase,
) {
  try {
    const grouping = database
      ? await recordSharedGrouping(database)
      : recordProcessLocalGrouping()

    // A database-backed aggregate bounds a burst across all instances. The
    // process-local path remains useful for callers that cannot provide the
    // shared database client, while the database observer always does.
    if (!grouping.shouldEmit) return false

    const delivered = await sendOperationsAlert(
      'ownership_guard_violation',
      'Database rejected a health-claim ownership-boundary write.',
      undefined,
      {
        groupedCount: grouping.groupedCount,
        groupingWindowSeconds: GROUPING_WINDOW_MS / 1000,
      },
    )
    console.error(JSON.stringify({
      event: 'health_claim_ownership_guard_rejected',
      alertEmitted: delivered,
      groupedCount: grouping.groupedCount,
    }))
    return delivered
  } catch {
    // Do not replace the database guard error with a grouping or alerting
    // failure, and never expose receiver responses, request data, or secrets.
    console.error(JSON.stringify({
      event: 'health_claim_ownership_guard_rejected',
      alertEmitted: false,
      errorCategory: 'alerting',
      errorCode: 'DELIVERY_FAILED',
    }))
    return false
  }
}