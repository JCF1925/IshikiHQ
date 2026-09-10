-- Hand-reviewed appointment care workflow migration.
ALTER TABLE "Organisation" ADD COLUMN "medicarePracticeIdentifier" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "offeringId" TEXT;

CREATE TABLE "AppointmentOffering" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "practiceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "appointmentType" TEXT,
  "durationMinutes" INTEGER,
  "medicareItem" TEXT,
  "defaultCost" DOUBLE PRECISION,
  "defaultMedicareRebate" DOUBLE PRECISION,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppointmentOffering_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AppointmentOfferingOverride" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "offeringId" TEXT NOT NULL,
  "practitionerId" TEXT NOT NULL,
  "durationMinutes" INTEGER,
  "medicareItem" TEXT,
  "cost" DOUBLE PRECISION,
  "medicareRebate" DOUBLE PRECISION,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppointmentOfferingOverride_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PrivateAgendaItem" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "title" TEXT NOT NULL, "details" TEXT,
  "startsAt" TIMESTAMP(3), "endsAt" TIMESTAMP(3), "practitionerId" TEXT, "practiceId" TEXT,
  "symptomId" TEXT, "appointmentId" TEXT, "status" TEXT NOT NULL DEFAULT 'open', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PrivateAgendaItem_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AppointmentOutcome" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "appointmentId" TEXT NOT NULL, "outcome" TEXT NOT NULL,
  "followUp" TEXT, "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "supersedesId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppointmentOutcome_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "AppointmentOutcome" ADD COLUMN "discussedItems" JSONB;
ALTER TABLE "AppointmentOutcome" ADD COLUMN "payment" JSONB;
ALTER TABLE "AppointmentOutcome" ADD COLUMN "referrals" JSONB;
ALTER TABLE "AppointmentOutcome" ADD COLUMN "pathologyRequests" JSONB;
ALTER TABLE "AppointmentOutcome" ADD COLUMN "medicationChanges" JSONB;
ALTER TABLE "AppointmentOutcome" ADD COLUMN "futureTasks" JSONB;
CREATE UNIQUE INDEX "AppointmentOfferingOverride_offeringId_practitionerId_key" ON "AppointmentOfferingOverride"("offeringId","practitionerId");
CREATE INDEX "AppointmentOffering_userId_practiceId_isActive_idx" ON "AppointmentOffering"("userId","practiceId","isActive");
CREATE INDEX "AppointmentOfferingOverride_userId_practitionerId_idx" ON "AppointmentOfferingOverride"("userId","practitionerId");
CREATE INDEX "PrivateAgendaItem_userId_startsAt_idx" ON "PrivateAgendaItem"("userId","startsAt");
CREATE INDEX "PrivateAgendaItem_userId_practitionerId_practiceId_idx" ON "PrivateAgendaItem"("userId","practitionerId","practiceId");
CREATE INDEX "PrivateAgendaItem_appointmentId_idx" ON "PrivateAgendaItem"("appointmentId");
CREATE INDEX "AppointmentOutcome_userId_appointmentId_recordedAt_idx" ON "AppointmentOutcome"("userId","appointmentId","recordedAt");
CREATE INDEX "AppointmentOutcome_supersedesId_idx" ON "AppointmentOutcome"("supersedesId");
CREATE INDEX "Appointment_offeringId_idx" ON "Appointment"("offeringId");
ALTER TABLE "AppointmentOffering" ADD CONSTRAINT "AppointmentOffering_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppointmentOffering" ADD CONSTRAINT "AppointmentOffering_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppointmentOfferingOverride" ADD CONSTRAINT "AppointmentOfferingOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppointmentOfferingOverride" ADD CONSTRAINT "AppointmentOfferingOverride_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "AppointmentOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppointmentOfferingOverride" ADD CONSTRAINT "AppointmentOfferingOverride_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PrivateAgendaItem" ADD CONSTRAINT "PrivateAgendaItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PrivateAgendaItem" ADD CONSTRAINT "PrivateAgendaItem_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PrivateAgendaItem" ADD CONSTRAINT "PrivateAgendaItem_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PrivateAgendaItem" ADD CONSTRAINT "PrivateAgendaItem_symptomId_fkey" FOREIGN KEY ("symptomId") REFERENCES "Symptom"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PrivateAgendaItem" ADD CONSTRAINT "PrivateAgendaItem_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AppointmentOutcome" ADD CONSTRAINT "AppointmentOutcome_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppointmentOutcome" ADD CONSTRAINT "AppointmentOutcome_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppointmentOutcome" ADD CONSTRAINT "AppointmentOutcome_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "AppointmentOutcome"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "AppointmentOffering"("id") ON DELETE SET NULL ON UPDATE CASCADE;