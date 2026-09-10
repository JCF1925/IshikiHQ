-- Imported claim rows must use the owner of their referenced import. This
-- prevents privileged writes from attaching another user's claim data to an
-- otherwise valid import.
CREATE OR REPLACE FUNCTION "validate_health_claim_import_row_owner"() RETURNS trigger AS $$
DECLARE
  import_owner_id TEXT;
BEGIN
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

CREATE TRIGGER "HealthClaimImportRow_owner_integrity"
BEFORE INSERT ON "HealthClaimImportRow"
FOR EACH ROW EXECUTE FUNCTION "validate_health_claim_import_row_owner"();