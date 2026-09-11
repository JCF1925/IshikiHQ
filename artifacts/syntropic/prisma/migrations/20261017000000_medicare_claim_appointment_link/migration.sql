ALTER TABLE "MedicareClaim"
  ADD COLUMN "appointmentId" TEXT;

CREATE INDEX "MedicareClaim_appointmentId_idx"
  ON "MedicareClaim"("appointmentId");

ALTER TABLE "MedicareClaim"
  ADD CONSTRAINT "MedicareClaim_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;