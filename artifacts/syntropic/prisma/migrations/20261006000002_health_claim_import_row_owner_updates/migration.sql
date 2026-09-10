-- Preserve owner integrity when ownership columns change while allowing a row
-- to move between imports that belong to the same user.
CREATE OR REPLACE FUNCTION "validate_health_claim_import_row_owner"() RETURNS trigger AS $$
DECLARE
  import_owner_id TEXT;
  previous_import_owner_id TEXT;
BEGIN
  SELECT "userId"
    INTO import_owner_id
    FROM "HealthClaimImport"
   WHERE "id" = NEW."importId";

  IF TG_OP = 'UPDATE' AND NEW."importId" IS DISTINCT FROM OLD."importId" THEN
    SELECT "userId"
      INTO previous_import_owner_id
      FROM "HealthClaimImport"
     WHERE "id" = OLD."importId";

    IF previous_import_owner_id IS DISTINCT FROM import_owner_id THEN
      RAISE EXCEPTION 'health claim import row cannot move between owners';
    END IF;
  END IF;

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