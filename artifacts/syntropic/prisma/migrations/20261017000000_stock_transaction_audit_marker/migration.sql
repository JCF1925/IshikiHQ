CREATE TYPE "StockTransactionAuditKind" AS ENUM ('reconciliation', 'mismatch_resolution');

ALTER TABLE "StockTransaction"
  ADD COLUMN "auditKind" "StockTransactionAuditKind";

-- Preserve the meaning of existing audit rows before diagnostics stop relying
-- on mutable note wording.
UPDATE "StockTransaction"
SET "auditKind" = 'reconciliation'
WHERE "notes" LIKE 'Historical stock reconciliation:%'
  AND "auditKind" IS NULL;

UPDATE "StockTransaction"
SET "auditKind" = 'mismatch_resolution'
WHERE "notes" LIKE 'Historical stock mismatch resolution:%'
  AND "auditKind" IS NULL;