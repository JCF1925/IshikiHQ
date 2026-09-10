-- Health claim account-deletion invariant:
-- * confirmed claim values and review rows are erased;
-- * the import remains as an ownership-detached tombstone;
-- * append-only lifecycle metadata remains, with user references detached.
ALTER TABLE "HealthClaimImport"
  ALTER COLUMN "userId" DROP NOT NULL;

ALTER TABLE "HealthClaimImport"
  DROP CONSTRAINT "HealthClaimImport_userId_fkey";
ALTER TABLE "HealthClaimImport"
  ADD CONSTRAINT "HealthClaimImport_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "HealthClaimImportAudit"
  ALTER COLUMN "userId" DROP NOT NULL,
  ALTER COLUMN "actorUserId" DROP NOT NULL;

ALTER TABLE "HealthClaimImportAudit"
  DROP CONSTRAINT "HealthClaimImportAudit_userId_fkey",
  DROP CONSTRAINT "HealthClaimImportAudit_actorUserId_fkey";
ALTER TABLE "HealthClaimImportAudit"
  ADD CONSTRAINT "HealthClaimImportAudit_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "HealthClaimImportAudit_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The account-deletion transaction explicitly detaches the two user references
-- under a transaction-local marker. All other updates and deletes remain blocked.
CREATE OR REPLACE FUNCTION "protect_health_claim_import_audit"() RETURNS trigger AS $$
BEGIN
  IF current_setting('app.health_claim_account_deletion', true) = 'on'
     AND TG_OP = 'UPDATE'
     AND (OLD."userId" IS DISTINCT FROM NEW."userId"
       OR OLD."actorUserId" IS DISTINCT FROM NEW."actorUserId")
     AND NEW."userId" IS NULL
     AND NEW."actorUserId" IS NULL THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'health claim import audit records are immutable';
END;
$$ LANGUAGE plpgsql;