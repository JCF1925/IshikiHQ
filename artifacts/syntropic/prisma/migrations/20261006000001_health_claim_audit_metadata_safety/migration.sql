-- Audit metadata may describe which claim fields changed, but it must never carry
-- claim values, request bodies, parser output, or file contents.
CREATE OR REPLACE FUNCTION "validate_health_claim_import_audit_metadata"() RETURNS trigger AS $$
BEGIN
  IF NEW."changedFields" IS NULL
     OR NEW."changedFields" = 'true'::jsonb
     OR (
       jsonb_typeof(NEW."changedFields") = 'array'
       AND NOT EXISTS (
         SELECT 1
           FROM jsonb_array_elements(NEW."changedFields") AS item
          WHERE jsonb_typeof(item.value) <> 'string'
             OR item.value #>> '{}' NOT IN (
               'claimNumber', 'serviceDate', 'description', 'itemNumber', 'provider',
               'scheduleFee', 'feeCharged', 'chargedAmount', 'benefitPaid',
               'benefitAmount', 'outOfPocket', 'financialYear', 'isForecast',
               'countsToSafetyNet', 'serviceType', 'benefitDetail', 'claimStatus'
             )
       )
     ) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'health claim import audit metadata must contain field names only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "HealthClaimImportAudit_metadata_safety" ON "HealthClaimImportAudit";
CREATE TRIGGER "HealthClaimImportAudit_metadata_safety"
BEFORE INSERT ON "HealthClaimImportAudit"
FOR EACH ROW EXECUTE FUNCTION "validate_health_claim_import_audit_metadata"();