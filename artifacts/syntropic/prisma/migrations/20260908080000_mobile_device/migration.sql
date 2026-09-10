-- MobileMedicationReminder depends on MobileDevice, so create the device
-- identity before the reminder migration runs.
CREATE TABLE "MobileDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "installId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "appVersion" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MobileDevice_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MobileDevice_userId_idx" ON "MobileDevice"("userId");
CREATE UNIQUE INDEX "MobileDevice_userId_installId_key" ON "MobileDevice"("userId", "installId");

ALTER TABLE "MobileDevice" ADD CONSTRAINT "MobileDevice_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;