-- CreateTable
CREATE TABLE "MobileDeviceSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MobileDeviceSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MobileRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT,
    "clientId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MobileRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MobileSyncChange" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT,
    "changeId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MobileSyncChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MobileIdempotencyKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MobileIdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MobileUpload" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "content" BYTEA,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MobileUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MobilePushDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'production',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MobilePushDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MobileReminderSetting" (
    "userId" TEXT NOT NULL,
    "medications" BOOLEAN NOT NULL,
    "tasks" BOOLEAN NOT NULL,
    "events" BOOLEAN NOT NULL,
    "quietHoursStart" TEXT,
    "quietHoursEnd" TEXT,
    "timezone" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MobileReminderSetting_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "AppleHealthControl" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sampleType" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "lookbackDays" INTEGER NOT NULL DEFAULT 30,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppleHealthControl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppleHealthImportedCopyControl" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sampleType" TEXT NOT NULL,
    "annotation" TEXT,
    "excludeFromTrends" BOOLEAN NOT NULL DEFAULT false,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "disconnected" BOOLEAN NOT NULL DEFAULT false,
    "pausedAt" TIMESTAMP(3),
    "disconnectedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppleHealthImportedCopyControl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppleHealthImportBatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "sampleType" TEXT NOT NULL,
    "previousAnchor" TEXT,
    "nextAnchor" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "acceptedCount" INTEGER NOT NULL,
    "duplicateCount" INTEGER NOT NULL,
    "deletionCount" INTEGER NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppleHealthImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppleHealthSample" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "healthKitUuid" TEXT NOT NULL,
    "sampleType" TEXT NOT NULL,
    "value" DECIMAL(65,30) NOT NULL,
    "unit" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "sourceBundleId" TEXT NOT NULL,
    "sourceRevision" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppleHealthSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppleHealthDeletion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "healthKitUuid" TEXT NOT NULL,
    "sampleType" TEXT NOT NULL,
    "healthKitDeletedAt" TIMESTAMP(3) NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppleHealthDeletion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppleHealthImportedCopyTombstone" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sampleType" TEXT NOT NULL,
    "healthKitUuid" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppleHealthImportedCopyTombstone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppleHealthAnchor" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "sampleType" TEXT NOT NULL,
    "anchor" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppleHealthAnchor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MobileAnomaly" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sampleType" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "summary" TEXT NOT NULL,
    "disclaimer" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MobileAnomaly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppleHealthAuditRecord" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT,
    "action" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppleHealthAuditRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MobileDeviceSession_tokenHash_key" ON "MobileDeviceSession"("tokenHash");

-- CreateIndex
CREATE INDEX "MobileDeviceSession_userId_deviceId_idx" ON "MobileDeviceSession"("userId", "deviceId");

-- CreateIndex
CREATE INDEX "MobileDeviceSession_expiresAt_idx" ON "MobileDeviceSession"("expiresAt");

-- CreateIndex
CREATE INDEX "MobileRecord_userId_updatedAt_idx" ON "MobileRecord"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MobileRecord_userId_entityType_clientId_key" ON "MobileRecord"("userId", "entityType", "clientId");

-- CreateIndex
CREATE INDEX "MobileSyncChange_userId_id_idx" ON "MobileSyncChange"("userId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MobileSyncChange_userId_changeId_key" ON "MobileSyncChange"("userId", "changeId");

-- CreateIndex
CREATE INDEX "MobileIdempotencyKey_expiresAt_idx" ON "MobileIdempotencyKey"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "MobileIdempotencyKey_userId_scope_key_key" ON "MobileIdempotencyKey"("userId", "scope", "key");

-- CreateIndex
CREATE INDEX "MobileUpload_userId_status_idx" ON "MobileUpload"("userId", "status");

-- CreateIndex
CREATE INDEX "MobilePushDevice_userId_idx" ON "MobilePushDevice"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MobilePushDevice_provider_token_key" ON "MobilePushDevice"("provider", "token");

-- CreateIndex
CREATE UNIQUE INDEX "AppleHealthControl_userId_sampleType_key" ON "AppleHealthControl"("userId", "sampleType");

-- CreateIndex
CREATE UNIQUE INDEX "AppleHealthImportedCopyControl_userId_sampleType_key" ON "AppleHealthImportedCopyControl"("userId", "sampleType");

-- CreateIndex
CREATE INDEX "AppleHealthImportBatch_userId_sampleType_importedAt_idx" ON "AppleHealthImportBatch"("userId", "sampleType", "importedAt");

-- CreateIndex
CREATE INDEX "AppleHealthSample_userId_sampleType_startAt_idx" ON "AppleHealthSample"("userId", "sampleType", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "AppleHealthSample_userId_healthKitUuid_key" ON "AppleHealthSample"("userId", "healthKitUuid");

-- CreateIndex
CREATE INDEX "AppleHealthDeletion_batchId_idx" ON "AppleHealthDeletion"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "AppleHealthDeletion_userId_healthKitUuid_key" ON "AppleHealthDeletion"("userId", "healthKitUuid");

-- CreateIndex
CREATE INDEX "AppleHealthImportedCopyTombstone_userId_sampleType_idx" ON "AppleHealthImportedCopyTombstone"("userId", "sampleType");

-- CreateIndex
CREATE UNIQUE INDEX "AppleHealthImportedCopyTombstone_userId_healthKitUuid_key" ON "AppleHealthImportedCopyTombstone"("userId", "healthKitUuid");

-- CreateIndex
CREATE UNIQUE INDEX "AppleHealthAnchor_deviceId_sampleType_key" ON "AppleHealthAnchor"("deviceId", "sampleType");

-- CreateIndex
CREATE INDEX "MobileAnomaly_userId_status_createdAt_idx" ON "MobileAnomaly"("userId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MobileAnomaly_userId_fingerprint_key" ON "MobileAnomaly"("userId", "fingerprint");

-- CreateIndex
CREATE INDEX "AppleHealthAuditRecord_userId_createdAt_idx" ON "AppleHealthAuditRecord"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "MobileDeviceSession" ADD CONSTRAINT "MobileDeviceSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileDeviceSession" ADD CONSTRAINT "MobileDeviceSession_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "MobileDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileRecord" ADD CONSTRAINT "MobileRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileRecord" ADD CONSTRAINT "MobileRecord_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "MobileDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileSyncChange" ADD CONSTRAINT "MobileSyncChange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileSyncChange" ADD CONSTRAINT "MobileSyncChange_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "MobileDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileIdempotencyKey" ADD CONSTRAINT "MobileIdempotencyKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileUpload" ADD CONSTRAINT "MobileUpload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobilePushDevice" ADD CONSTRAINT "MobilePushDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobilePushDevice" ADD CONSTRAINT "MobilePushDevice_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "MobileDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileReminderSetting" ADD CONSTRAINT "MobileReminderSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppleHealthControl" ADD CONSTRAINT "AppleHealthControl_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppleHealthImportedCopyControl" ADD CONSTRAINT "AppleHealthImportedCopyControl_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppleHealthImportBatch" ADD CONSTRAINT "AppleHealthImportBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppleHealthImportBatch" ADD CONSTRAINT "AppleHealthImportBatch_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "MobileDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppleHealthSample" ADD CONSTRAINT "AppleHealthSample_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppleHealthSample" ADD CONSTRAINT "AppleHealthSample_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "AppleHealthImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppleHealthDeletion" ADD CONSTRAINT "AppleHealthDeletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppleHealthDeletion" ADD CONSTRAINT "AppleHealthDeletion_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "AppleHealthImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppleHealthImportedCopyTombstone" ADD CONSTRAINT "AppleHealthImportedCopyTombstone_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppleHealthAnchor" ADD CONSTRAINT "AppleHealthAnchor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppleHealthAnchor" ADD CONSTRAINT "AppleHealthAnchor_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "MobileDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppleHealthAnchor" ADD CONSTRAINT "AppleHealthAnchor_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "AppleHealthImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileAnomaly" ADD CONSTRAINT "MobileAnomaly_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppleHealthAuditRecord" ADD CONSTRAINT "AppleHealthAuditRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppleHealthAuditRecord" ADD CONSTRAINT "AppleHealthAuditRecord_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "MobileDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;