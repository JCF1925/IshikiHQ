-- Complete the relationship deferred by the earlier medication-reminder
-- migration, which is ordered before MobileDevice is created.
DO $$
BEGIN
  IF to_regclass('"MobileMedicationReminder"') IS NOT NULL
     AND to_regclass('"MobileDevice"') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'MobileMedicationReminder_deviceId_fkey'
     ) THEN
    ALTER TABLE "MobileMedicationReminder" ADD CONSTRAINT "MobileMedicationReminder_deviceId_fkey"
      FOREIGN KEY ("deviceId") REFERENCES "MobileDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;