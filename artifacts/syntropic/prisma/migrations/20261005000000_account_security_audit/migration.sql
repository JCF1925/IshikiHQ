CREATE TABLE "AccountSecurityAudit" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "accountFingerprint" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "AccountSecurityAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AccountSecurityAudit_actorUserId_createdAt_idx"
ON "AccountSecurityAudit"("actorUserId", "createdAt");
CREATE INDEX "AccountSecurityAudit_accountFingerprint_createdAt_idx"
ON "AccountSecurityAudit"("accountFingerprint", "createdAt");
ALTER TABLE "AccountSecurityAudit"
ADD CONSTRAINT "AccountSecurityAudit_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "GenericUpload" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'prepared',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GenericUpload_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GenericUpload_storageKey_key" ON "GenericUpload"("storageKey");
CREATE INDEX "GenericUpload_userId_createdAt_idx" ON "GenericUpload"("userId", "createdAt");
ALTER TABLE "GenericUpload"
ADD CONSTRAINT "GenericUpload_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;