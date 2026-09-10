-- CreateEnum
CREATE TYPE "HealthClaimImportAuditAction" AS ENUM (
  'source_uploaded',
  'import_rejected',
  'row_edited',
  'row_excluded',
  'row_included',
  'import_confirmed',
  'review_canceled',
  'source_removed'
);

-- CreateTable
CREATE TABLE "HealthClaimImportAudit" (
  "id" TEXT NOT NULL,
  "importId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "action" "HealthClaimImportAuditAction" NOT NULL,
  "rowNumber" INTEGER,
  "previousStatus" TEXT,
  "nextStatus" TEXT,
  "changedFields" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HealthClaimImportAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HealthClaimImportAudit_importId_createdAt_idx"
  ON "HealthClaimImportAudit"("importId", "createdAt");
CREATE INDEX "HealthClaimImportAudit_userId_createdAt_idx"
  ON "HealthClaimImportAudit"("userId", "createdAt");
CREATE INDEX "HealthClaimImportAudit_actorUserId_createdAt_idx"
  ON "HealthClaimImportAudit"("actorUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "HealthClaimImportAudit"
  ADD CONSTRAINT "HealthClaimImportAudit_importId_fkey"
  FOREIGN KEY ("importId") REFERENCES "HealthClaimImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthClaimImportAudit"
  ADD CONSTRAINT "HealthClaimImportAudit_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthClaimImportAudit"
  ADD CONSTRAINT "HealthClaimImportAudit_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Audit history must remain append-only even if a future code path bypasses the application contract.
CREATE OR REPLACE FUNCTION "protect_health_claim_import_audit"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'health claim import audit records are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "HealthClaimImportAudit_immutable"
BEFORE UPDATE OR DELETE ON "HealthClaimImportAudit"
FOR EACH ROW EXECUTE FUNCTION "protect_health_claim_import_audit"();