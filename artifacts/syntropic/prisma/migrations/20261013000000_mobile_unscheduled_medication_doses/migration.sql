ALTER TABLE "MedicationLog" ADD COLUMN "medicationId" TEXT;

UPDATE "MedicationLog" ml
SET "medicationId" = COALESCE(ds."medicationId", p."medicationId")
FROM "DosageSchedule" ds
LEFT JOIN "Prescription" p ON p."id" = ds."prescriptionId"
WHERE ml."scheduleId" = ds."id";

ALTER TABLE "MedicationLog" ALTER COLUMN "medicationId" SET NOT NULL;
ALTER TABLE "MedicationLog" ALTER COLUMN "scheduleId" DROP NOT NULL;

CREATE INDEX "MedicationLog_medicationId_idx" ON "MedicationLog"("medicationId");

ALTER TABLE "MedicationLog" ADD CONSTRAINT "MedicationLog_medicationId_fkey"
  FOREIGN KEY ("medicationId") REFERENCES "Medication"("id") ON DELETE CASCADE ON UPDATE CASCADE;