-- Preserve the earliest claim as the fingerprint owner if a historical race
-- already created duplicates. The later claims remain available to the user,
-- but no longer participate in import deduplication.
WITH ranked AS (
  SELECT "id",
         row_number() OVER (
           PARTITION BY "userId", "importFingerprint"
           ORDER BY "createdAt", "id"
         ) AS duplicate_rank
    FROM "MedicareClaim"
   WHERE "importFingerprint" IS NOT NULL
)
UPDATE "MedicareClaim" AS claim
   SET "importFingerprint" = NULL
  FROM ranked
 WHERE claim."id" = ranked."id"
   AND ranked.duplicate_rank > 1;

WITH ranked AS (
  SELECT "id",
         row_number() OVER (
           PARTITION BY "userId", "importFingerprint"
           ORDER BY "createdAt", "id"
         ) AS duplicate_rank
    FROM "PhiClaim"
   WHERE "importFingerprint" IS NOT NULL
)
UPDATE "PhiClaim" AS claim
   SET "importFingerprint" = NULL
  FROM ranked
 WHERE claim."id" = ranked."id"
   AND ranked.duplicate_rank > 1;

DROP INDEX IF EXISTS "MedicareClaim_userId_importFingerprint_idx";
DROP INDEX IF EXISTS "PhiClaim_userId_importFingerprint_idx";

CREATE UNIQUE INDEX "MedicareClaim_userId_importFingerprint_key"
  ON "MedicareClaim"("userId", "importFingerprint");

CREATE UNIQUE INDEX "PhiClaim_userId_importFingerprint_key"
  ON "PhiClaim"("userId", "importFingerprint");