-- CreateEnum
CREATE TYPE "SuggestionDecision" AS ENUM ('pending', 'accepted', 'rejected', 'corrected', 'superseded');

-- CreateEnum
CREATE TYPE "RedbarkConnectionStatus" AS ENUM ('pending', 'active', 'consent_expired', 'outage', 'disconnected', 'failed');

-- CreateEnum
CREATE TYPE "RedbarkSyncJobStatus" AS ENUM ('queued', 'running', 'retrying', 'succeeded', 'failed', 'dead_letter', 'cancelled');

-- CreateEnum
CREATE TYPE "ForwardedCandidateKind" AS ENUM ('bill', 'subscription', 'bnpl', 'appointment', 'receipt');

-- CreateEnum
CREATE TYPE "ReviewCandidateStatus" AS ENUM ('pending', 'accepted', 'rejected');

-- CreateTable
CREATE TABLE "AutomationSetting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoryAutoApplyThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.9,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategorySuggestion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "suggestedCategory" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "normalizedMerchant" TEXT,
    "evidence" JSONB NOT NULL,
    "autoApplied" BOOLEAN NOT NULL DEFAULT false,
    "previousCategory" TEXT,
    "decision" "SuggestionDecision" NOT NULL DEFAULT 'pending',
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategorySuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryCorrection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "suggestionId" TEXT,
    "normalizedMerchant" TEXT,
    "previousCategory" TEXT,
    "confirmedCategory" TEXT NOT NULL,
    "explicitlyConfirmed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CategoryCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RedbarkGateAttestation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gate" TEXT NOT NULL,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "contractValue" TEXT,
    "evidence" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RedbarkGateAttestation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RedbarkConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerConnectionId" TEXT,
    "credentialReference" TEXT,
    "status" "RedbarkConnectionStatus" NOT NULL DEFAULT 'pending',
    "apiVersion" TEXT,
    "sandboxOnly" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "disconnectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RedbarkConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RedbarkConsent" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "providerConsentId" TEXT NOT NULL,
    "scopes" TEXT[],
    "grantedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "deletionDueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RedbarkConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RedbarkAccount" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "finAccountId" TEXT,
    "rawAccount" JSONB NOT NULL,
    "providerName" TEXT,
    "providerType" TEXT,
    "providerCurrency" TEXT,
    "providerBalance" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RedbarkAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RedbarkSourceTransaction" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "redbarkAccountId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "providerTransactionId" TEXT NOT NULL,
    "reconciliationKey" TEXT,
    "providerStatus" TEXT NOT NULL,
    "providerAmount" TEXT NOT NULL,
    "providerCurrency" TEXT NOT NULL,
    "providerDate" TEXT NOT NULL,
    "providerMerchant" TEXT,
    "providerDescription" TEXT,
    "rawPayload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RedbarkSourceTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RedbarkSourceObservation" (
    "id" TEXT NOT NULL,
    "sourceTransactionId" TEXT NOT NULL,
    "observationHash" TEXT NOT NULL,
    "providerStatus" TEXT NOT NULL,
    "providerAmount" TEXT NOT NULL,
    "providerCurrency" TEXT NOT NULL,
    "providerDate" TEXT NOT NULL,
    "providerMerchant" TEXT,
    "providerDescription" TEXT,
    "rawPayload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RedbarkSourceObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RedbarkSyncJob" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "RedbarkSyncJobStatus" NOT NULL DEFAULT 'queued',
    "progressCurrent" INTEGER NOT NULL DEFAULT 0,
    "progressTotal" INTEGER,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "nextRetryAt" TIMESTAMP(3),
    "cursor" TEXT,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "consentExpiresAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RedbarkSyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForwardedMessageCandidate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "kind" "ForwardedCandidateKind" NOT NULL,
    "status" "ReviewCandidateStatus" NOT NULL DEFAULT 'pending',
    "title" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "sourceRefs" JSONB NOT NULL,
    "proposedAction" JSONB NOT NULL,
    "minimumData" JSONB NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForwardedMessageCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialAggregateSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "dimensionValue" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "sourceVersion" TEXT NOT NULL,
    "transactionCount" INTEGER NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialAggregateSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialAggregateSource" (
    "snapshotId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "sourceTransactionId" TEXT,

    CONSTRAINT "FinancialAggregateSource_pkey" PRIMARY KEY ("snapshotId","transactionId")
);

-- CreateIndex
CREATE UNIQUE INDEX "AutomationSetting_userId_key" ON "AutomationSetting"("userId");

-- CreateIndex
CREATE INDEX "CategorySuggestion_userId_decision_idx" ON "CategorySuggestion"("userId", "decision");

-- CreateIndex
CREATE INDEX "CategorySuggestion_transactionId_createdAt_idx" ON "CategorySuggestion"("transactionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryCorrection_suggestionId_key" ON "CategoryCorrection"("suggestionId");

-- CreateIndex
CREATE INDEX "CategoryCorrection_userId_normalizedMerchant_idx" ON "CategoryCorrection"("userId", "normalizedMerchant");

-- CreateIndex
CREATE UNIQUE INDEX "RedbarkGateAttestation_userId_gate_key" ON "RedbarkGateAttestation"("userId", "gate");

-- CreateIndex
CREATE UNIQUE INDEX "RedbarkConnection_providerConnectionId_key" ON "RedbarkConnection"("providerConnectionId");

-- CreateIndex
CREATE INDEX "RedbarkConnection_userId_status_idx" ON "RedbarkConnection"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RedbarkConsent_providerConsentId_key" ON "RedbarkConsent"("providerConsentId");

-- CreateIndex
CREATE INDEX "RedbarkConsent_connectionId_expiresAt_idx" ON "RedbarkConsent"("connectionId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "RedbarkAccount_connectionId_providerAccountId_key" ON "RedbarkAccount"("connectionId", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "RedbarkSourceTransaction_idempotencyKey_key" ON "RedbarkSourceTransaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "RedbarkSourceTransaction_connectionId_providerTransactionId_idx" ON "RedbarkSourceTransaction"("connectionId", "providerTransactionId");

-- CreateIndex
CREATE INDEX "RedbarkSourceTransaction_connectionId_reconciliationKey_idx" ON "RedbarkSourceTransaction"("connectionId", "reconciliationKey");

-- CreateIndex
CREATE INDEX "RedbarkSourceTransaction_transactionId_idx" ON "RedbarkSourceTransaction"("transactionId");

-- CreateIndex
CREATE INDEX "RedbarkSourceObservation_sourceTransactionId_receivedAt_idx" ON "RedbarkSourceObservation"("sourceTransactionId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RedbarkSourceObservation_sourceTransactionId_observationHas_key" ON "RedbarkSourceObservation"("sourceTransactionId", "observationHash");

-- CreateIndex
CREATE INDEX "RedbarkSyncJob_connectionId_status_createdAt_idx" ON "RedbarkSyncJob"("connectionId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RedbarkSyncJob_connectionId_idempotencyKey_key" ON "RedbarkSyncJob"("connectionId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ForwardedMessageCandidate_userId_status_createdAt_idx" ON "ForwardedMessageCandidate"("userId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ForwardedMessageCandidate_userId_idempotencyKey_key" ON "ForwardedMessageCandidate"("userId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "FinancialAggregateSnapshot_userId_periodStart_periodEnd_idx" ON "FinancialAggregateSnapshot"("userId", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialAggregateSnapshot_userId_dimension_dimensionValue__key" ON "FinancialAggregateSnapshot"("userId", "dimension", "dimensionValue", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "FinancialAggregateSource_transactionId_idx" ON "FinancialAggregateSource"("transactionId");

-- CreateIndex
CREATE INDEX "FinancialAggregateSource_sourceTransactionId_idx" ON "FinancialAggregateSource"("sourceTransactionId");

-- AddForeignKey
ALTER TABLE "AutomationSetting" ADD CONSTRAINT "AutomationSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategorySuggestion" ADD CONSTRAINT "CategorySuggestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategorySuggestion" ADD CONSTRAINT "CategorySuggestion_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryCorrection" ADD CONSTRAINT "CategoryCorrection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryCorrection" ADD CONSTRAINT "CategoryCorrection_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryCorrection" ADD CONSTRAINT "CategoryCorrection_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "CategorySuggestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedbarkGateAttestation" ADD CONSTRAINT "RedbarkGateAttestation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedbarkConnection" ADD CONSTRAINT "RedbarkConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedbarkConsent" ADD CONSTRAINT "RedbarkConsent_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "RedbarkConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedbarkAccount" ADD CONSTRAINT "RedbarkAccount_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "RedbarkConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedbarkAccount" ADD CONSTRAINT "RedbarkAccount_finAccountId_fkey" FOREIGN KEY ("finAccountId") REFERENCES "FinAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedbarkSourceTransaction" ADD CONSTRAINT "RedbarkSourceTransaction_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "RedbarkConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedbarkSourceTransaction" ADD CONSTRAINT "RedbarkSourceTransaction_redbarkAccountId_fkey" FOREIGN KEY ("redbarkAccountId") REFERENCES "RedbarkAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedbarkSourceTransaction" ADD CONSTRAINT "RedbarkSourceTransaction_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedbarkSourceObservation" ADD CONSTRAINT "RedbarkSourceObservation_sourceTransactionId_fkey" FOREIGN KEY ("sourceTransactionId") REFERENCES "RedbarkSourceTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedbarkSyncJob" ADD CONSTRAINT "RedbarkSyncJob_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "RedbarkConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForwardedMessageCandidate" ADD CONSTRAINT "ForwardedMessageCandidate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialAggregateSnapshot" ADD CONSTRAINT "FinancialAggregateSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialAggregateSource" ADD CONSTRAINT "FinancialAggregateSource_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "FinancialAggregateSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialAggregateSource" ADD CONSTRAINT "FinancialAggregateSource_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialAggregateSource" ADD CONSTRAINT "FinancialAggregateSource_sourceTransactionId_fkey" FOREIGN KEY ("sourceTransactionId") REFERENCES "RedbarkSourceTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

