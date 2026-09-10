-- CreateEnum
CREATE TYPE "HealthClaimImportKind" AS ENUM ('medicare', 'private_health');

-- CreateEnum
CREATE TYPE "HealthClaimImportStatus" AS ENUM ('review', 'confirmed', 'canceled', 'rejected');

-- AlterTable
ALTER TABLE "MedicareClaim"
  ADD COLUMN "importFingerprint" TEXT,
  ADD COLUMN "sourceImportId" TEXT,
  ADD COLUMN "sourceRowId" TEXT;

-- CreateTable
CREATE TABLE "PhiClaim" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "policyId" TEXT NOT NULL,
  "claimNumber" TEXT,
  "serviceDate" TIMESTAMP(3) NOT NULL,
  "provider" TEXT,
  "serviceType" TEXT,
  "description" TEXT NOT NULL,
  "itemNumber" TEXT,
  "chargedAmount" DOUBLE PRECISION,
  "benefitAmount" DOUBLE PRECISION,
  "outOfPocket" DOUBLE PRECISION DEFAULT 0,
  "benefitDetail" TEXT,
  "claimStatus" TEXT,
  "notes" TEXT,
  "sourceImportId" TEXT,
  "sourceRowId" TEXT,
  "importFingerprint" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PhiClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthClaimImport" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" "HealthClaimImportKind" NOT NULL,
  "fileName" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "status" "HealthClaimImportStatus" NOT NULL DEFAULT 'review',
  "detectedFields" JSONB,
  "parseErrors" JSONB,
  "confirmedAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HealthClaimImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthClaimImportRow" (
  "id" TEXT NOT NULL,
  "importId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "rowNumber" INTEGER NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "data" JSONB NOT NULL,
  "errors" JSONB,
  "status" TEXT NOT NULL DEFAULT 'valid',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HealthClaimImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PhiClaim_userId_idx" ON "PhiClaim"("userId");
CREATE INDEX "PhiClaim_policyId_idx" ON "PhiClaim"("policyId");
CREATE INDEX "PhiClaim_serviceDate_idx" ON "PhiClaim"("serviceDate");
CREATE INDEX "PhiClaim_userId_importFingerprint_idx" ON "PhiClaim"("userId", "importFingerprint");
CREATE INDEX "HealthClaimImport_userId_status_idx" ON "HealthClaimImport"("userId", "status");
CREATE UNIQUE INDEX "HealthClaimImport_userId_sha256_key" ON "HealthClaimImport"("userId", "sha256");
CREATE INDEX "HealthClaimImportRow_userId_fingerprint_idx" ON "HealthClaimImportRow"("userId", "fingerprint");
CREATE INDEX "HealthClaimImportRow_importId_status_idx" ON "HealthClaimImportRow"("importId", "status");
CREATE UNIQUE INDEX "HealthClaimImportRow_importId_rowNumber_key" ON "HealthClaimImportRow"("importId", "rowNumber");
CREATE INDEX "MedicareClaim_userId_importFingerprint_idx" ON "MedicareClaim"("userId", "importFingerprint");

-- AddForeignKey
ALTER TABLE "PhiClaim" ADD CONSTRAINT "PhiClaim_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PhiClaim" ADD CONSTRAINT "PhiClaim_policyId_fkey"
  FOREIGN KEY ("policyId") REFERENCES "PhiPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthClaimImport" ADD CONSTRAINT "HealthClaimImport_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthClaimImportRow" ADD CONSTRAINT "HealthClaimImportRow_importId_fkey"
  FOREIGN KEY ("importId") REFERENCES "HealthClaimImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthClaimImportRow" ADD CONSTRAINT "HealthClaimImportRow_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;