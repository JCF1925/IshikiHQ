CREATE TABLE "MobileMedicationReminder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "revealName" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MobileMedicationReminder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MobileMedicationReminder_deviceId_scheduleId_key" ON "MobileMedicationReminder"("deviceId", "scheduleId");
CREATE INDEX "MobileMedicationReminder_userId_idx" ON "MobileMedicationReminder"("userId");
CREATE INDEX "MobileMedicationReminder_scheduleId_idx" ON "MobileMedicationReminder"("scheduleId");

ALTER TABLE "MobileMedicationReminder" ADD CONSTRAINT "MobileMedicationReminder_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- MobileDevice is introduced by a later migration. Add this relationship
-- after that migration so Prisma can deploy this migration on a fresh schema.
DO $$
BEGIN
  IF to_regclass('"MobileDevice"') IS NOT NULL THEN
    ALTER TABLE "MobileMedicationReminder" ADD CONSTRAINT "MobileMedicationReminder_deviceId_fkey"
      FOREIGN KEY ("deviceId") REFERENCES "MobileDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
ALTER TABLE "MobileMedicationReminder" ADD CONSTRAINT "MobileMedicationReminder_scheduleId_fkey"
  FOREIGN KEY ("scheduleId") REFERENCES "DosageSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;