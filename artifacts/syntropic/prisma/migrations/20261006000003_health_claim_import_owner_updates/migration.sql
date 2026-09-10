-- Tie every imported row to both its parent import and that import's owner.
-- PostgreSQL's foreign-key locking closes the race between a concurrent row
-- insert and parent owner update that a trigger-only existence check cannot.
CREATE UNIQUE INDEX "HealthClaimImport_id_userId_key"
ON "HealthClaimImport"("id", "userId");

ALTER TABLE "HealthClaimImportRow"
DROP CONSTRAINT "HealthClaimImportRow_importId_fkey";

-- NOT VALID preserves diagnosability of any legacy mismatches while enforcing
-- the invariant for every new insert and update.
ALTER TABLE "HealthClaimImportRow"
ADD CONSTRAINT "HealthClaimImportRow_importId_userId_fkey"
FOREIGN KEY ("importId", "userId")
REFERENCES "HealthClaimImport"("id", "userId")
ON DELETE CASCADE
ON UPDATE RESTRICT
NOT VALID;