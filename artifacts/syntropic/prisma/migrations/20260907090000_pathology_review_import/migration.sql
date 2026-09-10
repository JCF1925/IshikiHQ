CREATE TYPE "PathologyReviewStatus" AS ENUM ('uploaded', 'extracting', 'in_review', 'confirmed', 'rejected');
CREATE TYPE "PathologyRetentionState" AS ENUM ('retained', 'deletion_requested', 'deleted');

CREATE TABLE "PathologyReport" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "cloudStoragePath" TEXT NOT NULL,
  "retentionState" "PathologyRetentionState" NOT NULL DEFAULT 'retained',
  "status" "PathologyReviewStatus" NOT NULL DEFAULT 'uploaded',
  "extractionVersion" TEXT,
  "extractedData" JSONB,
  "confirmedSnapshot" JSONB,
  "confirmedPanelId" TEXT,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PathologyReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PathologyAuditEvent" (
  "id" TEXT NOT NULL,
  "reportId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "beforeData" JSONB,
  "afterData" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PathologyAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PathologyExport" (
  "id" TEXT NOT NULL,
  "reportId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "format" TEXT NOT NULL,
  "selection" JSONB NOT NULL,
  "previewHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PathologyExport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PathologyReport_userId_sha256_key" ON "PathologyReport"("userId", "sha256");
CREATE UNIQUE INDEX "PathologyReport_confirmedPanelId_key" ON "PathologyReport"("confirmedPanelId");
CREATE INDEX "PathologyReport_userId_status_idx" ON "PathologyReport"("userId", "status");
CREATE INDEX "PathologyAuditEvent_reportId_createdAt_idx" ON "PathologyAuditEvent"("reportId", "createdAt");
CREATE INDEX "PathologyAuditEvent_userId_idx" ON "PathologyAuditEvent"("userId");
CREATE UNIQUE INDEX "PathologyExport_tokenHash_key" ON "PathologyExport"("tokenHash");
CREATE INDEX "PathologyExport_userId_expiresAt_idx" ON "PathologyExport"("userId", "expiresAt");

ALTER TABLE "PathologyReport" ADD CONSTRAINT "PathologyReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PathologyReport" ADD CONSTRAINT "PathologyReport_confirmedPanelId_fkey" FOREIGN KEY ("confirmedPanelId") REFERENCES "LabPanel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PathologyAuditEvent" ADD CONSTRAINT "PathologyAuditEvent_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "PathologyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PathologyAuditEvent" ADD CONSTRAINT "PathologyAuditEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PathologyExport" ADD CONSTRAINT "PathologyExport_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "PathologyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PathologyExport" ADD CONSTRAINT "PathologyExport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;