ALTER TABLE "HouseholdStorageQrReference"
  ALTER COLUMN "itemId" DROP NOT NULL,
  ADD COLUMN "containerId" TEXT;

ALTER TABLE "HouseholdStorageQrReference"
  ADD CONSTRAINT "HouseholdStorageQrReference_containerId_fkey"
  FOREIGN KEY ("containerId") REFERENCES "HouseholdStorageContainer"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HouseholdStorageQrReference"
  ADD CONSTRAINT "HouseholdStorageQrReference_exactly_one_resource_check"
  CHECK (("itemId" IS NOT NULL)::integer + ("containerId" IS NOT NULL)::integer = 1);

CREATE INDEX "HouseholdStorageQrReference_householdId_containerId_idx"
  ON "HouseholdStorageQrReference"("householdId", "containerId");