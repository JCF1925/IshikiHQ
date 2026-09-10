CREATE TABLE "Pharmacy" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "name" TEXT NOT NULL, "address" TEXT,
  "phone" TEXT, "notes" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Pharmacy_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "MedicationPharmacyPreference" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "medicationId" TEXT NOT NULL, "pharmacyId" TEXT NOT NULL,
  "isUsual" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "MedicationPharmacyPreference_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PharmacyOrder" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "pharmacyId" TEXT NOT NULL, "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL, "status" TEXT NOT NULL DEFAULT 'draft', "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacyOrder_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PharmacyOrderLine" (
  "id" TEXT NOT NULL, "orderId" TEXT NOT NULL, "medicationId" TEXT NOT NULL, "prescriptionId" TEXT,
  "quantity" DOUBLE PRECISION NOT NULL, "status" TEXT NOT NULL DEFAULT 'ordered', "substitutionNote" TEXT,
  "receivedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "PharmacyOrderLine_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PharmacyOrderEvent" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "orderId" TEXT NOT NULL, "fromStatus" TEXT,
  "toStatus" TEXT NOT NULL, "details" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PharmacyOrderEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Pharmacy_userId_name_key" ON "Pharmacy"("userId","name");
CREATE UNIQUE INDEX "MedicationPharmacyPreference_userId_medicationId_key" ON "MedicationPharmacyPreference"("userId","medicationId");
CREATE UNIQUE INDEX "PharmacyOrder_userId_pharmacyId_periodStart_key" ON "PharmacyOrder"("userId","pharmacyId","periodStart");
CREATE UNIQUE INDEX "PharmacyOrderLine_orderId_medicationId_key" ON "PharmacyOrderLine"("orderId","medicationId");
CREATE INDEX "Pharmacy_userId_isActive_idx" ON "Pharmacy"("userId","isActive");
CREATE INDEX "MedicationPharmacyPreference_userId_pharmacyId_idx" ON "MedicationPharmacyPreference"("userId","pharmacyId");
CREATE INDEX "PharmacyOrder_userId_status_idx" ON "PharmacyOrder"("userId","status");
CREATE INDEX "PharmacyOrderLine_orderId_status_idx" ON "PharmacyOrderLine"("orderId","status");
CREATE INDEX "PharmacyOrderEvent_userId_orderId_createdAt_idx" ON "PharmacyOrderEvent"("userId","orderId","createdAt");
ALTER TABLE "Pharmacy" ADD CONSTRAINT "Pharmacy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MedicationPharmacyPreference" ADD CONSTRAINT "MedicationPharmacyPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MedicationPharmacyPreference" ADD CONSTRAINT "MedicationPharmacyPreference_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "Medication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MedicationPharmacyPreference" ADD CONSTRAINT "MedicationPharmacyPreference_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "Pharmacy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyOrder" ADD CONSTRAINT "PharmacyOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyOrder" ADD CONSTRAINT "PharmacyOrder_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "Pharmacy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PharmacyOrderLine" ADD CONSTRAINT "PharmacyOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PharmacyOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PharmacyOrderLine" ADD CONSTRAINT "PharmacyOrderLine_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "Medication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PharmacyOrderLine" ADD CONSTRAINT "PharmacyOrderLine_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PharmacyOrderEvent" ADD CONSTRAINT "PharmacyOrderEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyOrderEvent" ADD CONSTRAINT "PharmacyOrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PharmacyOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;