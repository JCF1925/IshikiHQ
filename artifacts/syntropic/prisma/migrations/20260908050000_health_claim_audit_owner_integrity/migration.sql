-- Audit records must use the owner of the referenced import for both the
-- subject user and the acting user. Keep this separate from the immutable
-- update/delete trigger so the protections can evolve independently.
CREATE OR REPLACE FUNCTION "validate_health_claim_import_audit_owner"() RETURNS trigger AS $$
DECLARE
  import_owner_id TEXT;
BEGIN
  SELECT "userId"
    INTO import_owner_id
    FROM "HealthClaimImport"
   WHERE "id" = NEW."importId";

  IF NEW."userId" IS DISTINCT FROM import_owner_id THEN
    RAISE EXCEPTION 'health claim import audit user must match import owner';
  END IF;

  IF NEW."actorUserId" IS DISTINCT FROM import_owner_id THEN
    RAISE EXCEPTION 'health claim import audit actor must match import owner';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "HealthClaimImportAudit_owner_integrity"
BEFORE INSERT ON "HealthClaimImportAudit"
FOR EACH ROW EXECUTE FUNCTION "validate_health_claim_import_audit_owner"();