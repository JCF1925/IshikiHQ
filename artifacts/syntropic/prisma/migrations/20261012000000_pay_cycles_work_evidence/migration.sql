ALTER TABLE "IncomeSource" ADD COLUMN IF NOT EXISTS "annualPackageAmount" DOUBLE PRECISION;
ALTER TABLE "IncomeSource" ADD COLUMN IF NOT EXISTS "payFrequency" TEXT;
ALTER TABLE "IncomeSource" ADD COLUMN IF NOT EXISTS "firstPayDate" TIMESTAMP(3);
ALTER TABLE "IncomeSource" ADD COLUMN IF NOT EXISTS "payEndDate" TIMESTAMP(3);
ALTER TABLE "IncomeSource" ADD COLUMN IF NOT EXISTS "retainPayHistory" BOOLEAN NOT NULL DEFAULT true;
CREATE TABLE IF NOT EXISTS "PayCycle" (
 "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "incomeSourceId" TEXT NOT NULL, "frequency" TEXT NOT NULL,
 "annualPackageAmount" DOUBLE PRECISION NOT NULL, "firstPayDate" TIMESTAMP(3) NOT NULL, "endDate" TIMESTAMP(3),
 "retainHistory" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "PayCycle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PayCycle_userId_incomeSourceId_key" ON "PayCycle"("userId","incomeSourceId");
CREATE INDEX IF NOT EXISTS "PayCycle_userId_firstPayDate_idx" ON "PayCycle"("userId","firstPayDate");
CREATE TABLE IF NOT EXISTS "PayPeriod" (
 "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "cycleId" TEXT NOT NULL, "startDate" TIMESTAMP(3) NOT NULL, "endDate" TIMESTAMP(3) NOT NULL, "payDate" TIMESTAMP(3) NOT NULL,
 "expectedGross" DOUBLE PRECISION, "confirmedGross" DOUBLE PRECISION, "reimbursementAmount" DOUBLE PRECISION NOT NULL DEFAULT 0, "reconciliationDifference" DOUBLE PRECISION,
 "status" TEXT NOT NULL DEFAULT 'open', "confirmedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "PayPeriod_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PayPeriod_cycleId_startDate_key" ON "PayPeriod"("cycleId","startDate");
CREATE INDEX IF NOT EXISTS "PayPeriod_userId_payDate_idx" ON "PayPeriod"("userId","payDate");
CREATE TABLE IF NOT EXISTS "PayComponent" (
 "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "cycleId" TEXT NOT NULL, "periodId" TEXT, "kind" TEXT NOT NULL, "amount" DOUBLE PRECISION NOT NULL, "description" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "PayComponent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PayComponent_userId_cycleId_idx" ON "PayComponent"("userId","cycleId");
CREATE INDEX IF NOT EXISTS "PayComponent_periodId_idx" ON "PayComponent"("periodId");
CREATE TABLE IF NOT EXISTS "PayPeriodTransaction" (
 "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "periodId" TEXT NOT NULL, "transactionId" TEXT NOT NULL, "kind" TEXT NOT NULL DEFAULT 'gross', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "PayPeriodTransaction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PayPeriodTransaction_periodId_transactionId_key" ON "PayPeriodTransaction"("periodId","transactionId");
CREATE TABLE IF NOT EXISTS "WorkEvidence" (
 "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "periodId" TEXT NOT NULL, "evidenceType" TEXT NOT NULL, "hours" DOUBLE PRECISION NOT NULL DEFAULT 0, "leaveHours" DOUBLE PRECISION NOT NULL DEFAULT 0, "leaveType" TEXT, "location" TEXT, "notes" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "WorkEvidence_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "WorkEvidence_periodId_key" ON "WorkEvidence"("periodId");
CREATE TABLE IF NOT EXISTS "WorkPatternSnapshot" (
 "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "periodId" TEXT NOT NULL, "patternType" TEXT NOT NULL, "pattern" JSONB NOT NULL, "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "WorkPatternSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "WorkPatternSnapshot_periodId_key" ON "WorkPatternSnapshot"("periodId");
ALTER TABLE "PayCycle" ADD CONSTRAINT "PayCycle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayCycle" ADD CONSTRAINT "PayCycle_incomeSourceId_fkey" FOREIGN KEY ("incomeSourceId") REFERENCES "IncomeSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayPeriod" ADD CONSTRAINT "PayPeriod_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayPeriod" ADD CONSTRAINT "PayPeriod_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "PayCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayComponent" ADD CONSTRAINT "PayComponent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayComponent" ADD CONSTRAINT "PayComponent_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "PayCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayPeriodTransaction" ADD CONSTRAINT "PayPeriodTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayPeriodTransaction" ADD CONSTRAINT "PayPeriodTransaction_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayPeriodTransaction" ADD CONSTRAINT "PayPeriodTransaction_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkEvidence" ADD CONSTRAINT "WorkEvidence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkEvidence" ADD CONSTRAINT "WorkEvidence_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkPatternSnapshot" ADD CONSTRAINT "WorkPatternSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkPatternSnapshot" ADD CONSTRAINT "WorkPatternSnapshot_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayComponent" ADD CONSTRAINT "PayComponent_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PayCycle_frequency_check') THEN ALTER TABLE "PayCycle" ADD CONSTRAINT "PayCycle_frequency_check" CHECK ("frequency" IN ('fortnightly','monthly')); END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PayPeriod_status_check') THEN ALTER TABLE "PayPeriod" ADD CONSTRAINT "PayPeriod_status_check" CHECK ("status" IN ('open','confirmed')); END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WorkEvidence_type_check') THEN ALTER TABLE "WorkEvidence" ADD CONSTRAINT "WorkEvidence_type_check" CHECK ("evidenceType" IN ('regular_pattern','casual_roster')); END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WorkEvidence_location_check') THEN ALTER TABLE "WorkEvidence" ADD CONSTRAINT "WorkEvidence_location_check" CHECK ("location" IS NULL OR "location" IN ('workplace','home','mixed')); END IF;
END $$;
ALTER TABLE "PayPeriod" ADD COLUMN IF NOT EXISTS "reimbursementTransactionId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "PayPeriod_reimbursementTransactionId_key" ON "PayPeriod"("reimbursementTransactionId");
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PayPeriod_reimbursementTransactionId_fkey') THEN ALTER TABLE "PayPeriod" ADD CONSTRAINT "PayPeriod_reimbursementTransactionId_fkey" FOREIGN KEY ("reimbursementTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE; END IF;
END $$;
