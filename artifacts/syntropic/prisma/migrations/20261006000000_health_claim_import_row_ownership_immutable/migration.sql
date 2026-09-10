-- Imported claim row ownership is fixed when the row is created. This keeps
-- privileged updates from moving an existing row to another user's import,
-- including updates that change both ownership columns together.
CREATE OR REPLACE FUNCTION "validate_health_claim_import_row_owner"() RETURNS trigger AS $$
DECLARE
  import_owner_id TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW."importId" IS DISTINCT FROM OLD."importId"
    OR NEW."userId" IS DISTINCT FROM OLD."userId"
  ) THEN
    RAISE EXCEPTION 'health claim import row ownership is immutable';
  END IF;

  SELECT "userId"
    INTO import_owner_id
    FROM "HealthClaimImport"
   WHERE "id" = NEW."importId";

  IF NEW."userId" IS DISTINCT FROM import_owner_id THEN
    RAISE EXCEPTION 'health claim import row user must match import owner';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "HealthClaimImportRow_owner_integrity" ON "HealthClaimImportRow";

CREATE TRIGGER "HealthClaimImportRow_owner_integrity"
BEFORE INSERT OR UPDATE OF "importId", "userId" ON "HealthClaimImportRow"
FOR EACH ROW EXECUTE FUNCTION "validate_health_claim_import_row_owner"();
