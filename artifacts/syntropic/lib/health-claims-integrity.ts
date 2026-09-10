import type { PrismaClient } from '@prisma/client'

export type HealthClaimOwnershipCheck = {
  mismatchedRows: number
  affectedImports: number
}

type HealthClaimOwnershipQueryClient = Pick<PrismaClient, '$queryRaw'>

/**
 * Checks legacy claim rows without selecting claim payloads or user identifiers.
 * Keep this query read-only: it is used as a release/operations gate.
 */
export async function checkHealthClaimImportOwnership(
  db: HealthClaimOwnershipQueryClient,
): Promise<HealthClaimOwnershipCheck> {
  const [result] = await db.$queryRaw<HealthClaimOwnershipCheck[]>`
    SELECT
      COUNT(*)::integer AS "mismatchedRows",
      COUNT(DISTINCT claim_row."importId")::integer AS "affectedImports"
    FROM "HealthClaimImportRow" AS claim_row
    INNER JOIN "HealthClaimImport" AS claim_import
      ON claim_import."id" = claim_row."importId"
    WHERE claim_row."userId" IS DISTINCT FROM claim_import."userId"
  `

  return result ?? { mismatchedRows: 0, affectedImports: 0 }
}

export function formatHealthClaimOwnershipReport(result: HealthClaimOwnershipCheck): string {
  if (result.mismatchedRows === 0) {
    return 'Health claim import ownership check: PASS (0 mismatched rows; read-only)'
  }

  const importLabel = result.affectedImports === 1 ? 'import' : 'imports'
  const rowLabel = result.mismatchedRows === 1 ? 'row' : 'rows'
  return [
    `Health claim import ownership check: FAIL (${result.mismatchedRows} mismatched ${rowLabel} across ${result.affectedImports} ${importLabel})`,
    'No claim payloads, source metadata, or user identifiers were selected or printed.',
    'No records were changed. Resolve the ownership mismatch before release.',
  ].join('\n')
}