CREATE TABLE "PriceWatch" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "packQuantity" DOUBLE PRECISION NOT NULL,
  "packUnit" TEXT NOT NULL,
  "preferredRetailers" TEXT[] NOT NULL,
  "targetPrice" DOUBLE PRECISION,
  "checkCadence" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PriceWatch_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PriceObservation" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "watchId" TEXT NOT NULL,
  "price" DOUBLE PRECISION NOT NULL,
  "packQuantity" DOUBLE PRECISION NOT NULL,
  "packUnit" TEXT NOT NULL,
  "shippingCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "membershipAssumption" TEXT,
  "sourceUrl" TEXT,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PriceObservation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PriceWatch_userId_status_idx" ON "PriceWatch"("userId","status");
CREATE INDEX "PriceObservation_userId_watchId_observedAt_idx" ON "PriceObservation"("userId","watchId","observedAt");
ALTER TABLE "PriceWatch" ADD CONSTRAINT "PriceWatch_id_userId_key" UNIQUE ("id","userId");
ALTER TABLE "PriceWatch" ADD CONSTRAINT "PriceWatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PriceObservation" ADD CONSTRAINT "PriceObservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PriceObservation" ADD CONSTRAINT "PriceObservation_watchId_userId_fkey" FOREIGN KEY ("watchId","userId") REFERENCES "PriceWatch"("id","userId") ON DELETE CASCADE ON UPDATE CASCADE;