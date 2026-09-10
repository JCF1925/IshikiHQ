ALTER TABLE "Person"
  ADD COLUMN "referralRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Referral"
  ADD COLUMN "validityType" TEXT NOT NULL DEFAULT 'custom',
  ADD COLUMN "serviceLimitPeriod" TEXT;

ALTER TABLE "Appointment"
  ADD COLUMN "medicareRebateEligible" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "medicareRebateWarning" TEXT;

CREATE TABLE "ReferralUsage" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "referralId" TEXT NOT NULL,
  "appointmentId" TEXT NOT NULL,
  "serviceDate" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'counted',
  "releaseReason" TEXT,
  "countedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "releasedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReferralUsage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReferralUsage_appointmentId_referralId_key"
  ON "ReferralUsage"("appointmentId", "referralId");
CREATE INDEX "ReferralUsage_userId_referralId_status_serviceDate_idx"
  ON "ReferralUsage"("userId", "referralId", "status", "serviceDate");

ALTER TABLE "Appointment"
  ADD CONSTRAINT "Appointment_referralId_fkey"
  FOREIGN KEY ("referralId") REFERENCES "Referral"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReferralUsage"
  ADD CONSTRAINT "ReferralUsage_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ReferralUsage_referralId_fkey"
  FOREIGN KEY ("referralId") REFERENCES "Referral"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ReferralUsage_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;