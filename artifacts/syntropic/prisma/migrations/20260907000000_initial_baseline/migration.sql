-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('pending', 'confirmed', 'locked');

-- CreateEnum
CREATE TYPE "TransactionAuditAction" AS ENUM ('created', 'confirmed', 'locked', 'unlocked', 'updated', 'deleted');

-- CreateEnum
CREATE TYPE "CalendarProvider" AS ENUM ('google', 'microsoft', 'apple', 'other');

-- CreateEnum
CREATE TYPE "CalendarSyncDirection" AS ENUM ('syntropic_to_provider', 'provider_to_syntropic', 'two_way');

-- CreateEnum
CREATE TYPE "CalendarSyncStatus" AS ENUM ('pending', 'synced', 'error', 'conflict', 'disabled', 'cancelled');

-- CreateEnum
CREATE TYPE "CalendarSyncJobStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed', 'dead_letter', 'cancelled');

-- CreateEnum
CREATE TYPE "EventSource" AS ENUM ('manual', 'appointment', 'birthday', 'recurring', 'imported', 'calendar_sync');

-- CreateEnum
CREATE TYPE "EventVisibility" AS ENUM ('private', 'household', 'work_forwarded');

-- CreateEnum
CREATE TYPE "EventDeletionPolicy" AS ENUM ('delete_local', 'mark_cancelled', 'leave_local');

-- CreateEnum
CREATE TYPE "InviteDecision" AS ENUM ('rule_selected', 'manually_added', 'manually_removed', 'blocked');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('pending', 'sent', 'updated', 'cancelled', 'blocked', 'failed');

-- CreateEnum
CREATE TYPE "CalendarAuditAction" AS ENUM ('sync_created', 'sync_updated', 'sync_deleted', 'conflict_detected', 'invitation_sent', 'invitation_updated', 'invitation_cancelled', 'travel_block_created', 'medical_forwarding_confirmed');

-- CreateEnum
CREATE TYPE "TravelMode" AS ENUM ('driving', 'transit', 'walking', 'cycling', 'other');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "passwordHash" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Australia/Sydney',
    "currency" TEXT NOT NULL DEFAULT 'AUD',
    "theme" TEXT NOT NULL DEFAULT 'dark',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Medication" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "genericName" TEXT,
    "form" TEXT NOT NULL DEFAULT 'tablet',
    "strength" TEXT,
    "unit" TEXT,
    "parentId" TEXT,
    "medType" TEXT NOT NULL DEFAULT 'scheduled',
    "isSchedule8" BOOLEAN NOT NULL DEFAULT false,
    "isOtc" BOOLEAN NOT NULL DEFAULT false,
    "monthlyLimit" DOUBLE PRECISION,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Medication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prescription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "medicationId" TEXT NOT NULL,
    "prescriberId" TEXT,
    "datePrescribed" TIMESTAMP(3) NOT NULL,
    "quantity" INTEGER,
    "repeats" INTEGER NOT NULL DEFAULT 0,
    "repeatsUsed" INTEGER NOT NULL DEFAULT 0,
    "pbsItemCode" TEXT,
    "cost" DOUBLE PRECISION DEFAULT 0,
    "expiryDate" TIMESTAMP(3),
    "escriptToken" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DosageSchedule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "prescriptionId" TEXT,
    "medicationId" TEXT,
    "frequency" TEXT NOT NULL DEFAULT 'daily',
    "times" TEXT[],
    "doseAmount" TEXT NOT NULL,
    "presetSlot" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "withFood" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DosageSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicationLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL,
    "doseTaken" TEXT,
    "skipped" BOOLEAN NOT NULL DEFAULT false,
    "skipReason" TEXT,
    "symptomNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLevel" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "medicationId" TEXT NOT NULL,
    "currentQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reorderThreshold" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "lastDispensed" TIMESTAMP(3),
    "monthlyLimit" DOUBLE PRECISION,
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "bsb" TEXT,
    "accountNumber" TEXT,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "openingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "institution" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AUD',
    "merchant" TEXT,
    "description" TEXT,
    "category" TEXT,
    "subcategory" TEXT,
    "accountId" TEXT,
    "isDeductible" BOOLEAN NOT NULL DEFAULT false,
    "deductibilityConfidence" DOUBLE PRECISION DEFAULT 0,
    "taxCategory" TEXT,
    "isTransfer" BOOLEAN NOT NULL DEFAULT false,
    "isDishonoured" BOOLEAN NOT NULL DEFAULT false,
    "manuallyUnlocked" BOOLEAN NOT NULL DEFAULT false,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "recurringId" TEXT,
    "bnplPlanId" TEXT,
    "isForecast" BOOLEAN NOT NULL DEFAULT false,
    "status" "TransactionStatus" NOT NULL DEFAULT 'pending',
    "confirmedAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "tags" TEXT[],
    "receiptPath" TEXT,
    "receiptIsPublic" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "csvImportId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionAuditRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "action" "TransactionAuditAction" NOT NULL,
    "previousStatus" "TransactionStatus",
    "nextStatus" "TransactionStatus",
    "reason" TEXT,
    "changes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionAuditRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CsvImport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "columnMap" TEXT,
    "errors" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CsvImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'todo',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "isUrgent" BOOLEAN NOT NULL DEFAULT false,
    "isImportant" BOOLEAN NOT NULL DEFAULT false,
    "dueDate" TIMESTAMP(3),
    "dueTime" TEXT,
    "estimatedMinutes" INTEGER,
    "actualMinutes" INTEGER,
    "tags" TEXT[],
    "moduleRef" TEXT,
    "recurrenceRule" TEXT,
    "projectId" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "goalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'personal',
    "startDatetime" TIMESTAMP(3) NOT NULL,
    "endDatetime" TIMESTAMP(3),
    "location" TEXT,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "recurrenceRule" TEXT,
    "notes" TEXT,
    "peopleRefs" TEXT[],
    "moduleRef" TEXT,
    "tags" TEXT[],
    "googleCalendarId" TEXT,
    "source" "EventSource" NOT NULL DEFAULT 'manual',
    "sourceId" TEXT,
    "externalProvider" "CalendarProvider",
    "externalCalendarId" TEXT,
    "externalEventId" TEXT,
    "externalEtag" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "syncStatus" "CalendarSyncStatus" NOT NULL DEFAULT 'pending',
    "syncError" TEXT,
    "visibility" "EventVisibility" NOT NULL DEFAULT 'private',
    "travelMinutesBefore" INTEGER,
    "travelMode" "TravelMode",
    "onlineUrl" TEXT,
    "linkedCostSourceType" TEXT,
    "linkedCostSourceId" TEXT,
    "linkedCostAmount" DOUBLE PRECISION,
    "costOverrideAmount" DOUBLE PRECISION,
    "isCancelled" BOOLEAN NOT NULL DEFAULT false,
    "syncVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarProviderConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "CalendarProvider" NOT NULL,
    "providerAccountId" TEXT,
    "displayName" TEXT,
    "status" "CalendarSyncStatus" NOT NULL DEFAULT 'pending',
    "deletionPolicy" "EventDeletionPolicy" NOT NULL DEFAULT 'mark_cancelled',
    "credentialReference" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnectedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarProviderConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarSyncSetting" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "externalCalendarId" TEXT NOT NULL,
    "calendarName" TEXT,
    "direction" "CalendarSyncDirection" NOT NULL DEFAULT 'two_way',
    "eventTypes" TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "defaultVisibility" "EventVisibility" NOT NULL DEFAULT 'private',
    "deletionPolicy" "EventDeletionPolicy" NOT NULL DEFAULT 'mark_cancelled',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarSyncSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarSyncCursor" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "externalCalendarId" TEXT NOT NULL,
    "cursor" TEXT,
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarSyncCursor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarSyncJob" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "externalCalendarId" TEXT,
    "direction" "CalendarSyncDirection",
    "status" "CalendarSyncJobStatus" NOT NULL DEFAULT 'queued',
    "idempotencyKey" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarSyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarSyncConflict" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "localVersion" JSONB NOT NULL,
    "providerVersion" JSONB NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,

    CONSTRAINT "CalendarSyncConflict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarInviteRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "medicalRule" BOOLEAN NOT NULL DEFAULT false,
    "eventTypes" TEXT[],
    "tags" TEXT[],
    "linkedPersonIds" TEXT[],
    "recurringTemplateId" TEXT,
    "locationMatcher" TEXT,
    "minimumTravelMinutes" INTEGER,
    "inviteePersonIds" TEXT[],
    "firstMatchConfirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarInviteRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventInviteDecision" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "ruleId" TEXT,
    "personId" TEXT NOT NULL,
    "decision" "InviteDecision" NOT NULL,
    "reason" TEXT,
    "invitationStatus" "InvitationStatus" NOT NULL DEFAULT 'pending',
    "providerInvitationId" TEXT,
    "lastNotifiedVersion" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventInviteDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarIdempotencyKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "CalendarIdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarAuditRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT,
    "action" "CalendarAuditAction" NOT NULL,
    "idempotencyKey" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarAuditRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivateTravelBlock" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "startDatetime" TIMESTAMP(3) NOT NULL,
    "endDatetime" TIMESTAMP(3) NOT NULL,
    "travelMinutes" INTEGER NOT NULL,
    "travelMode" "TravelMode",
    "isPrivate" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrivateTravelBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventMedicalForwardingConsent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "connectionId" TEXT,
    "destinationCalendarId" TEXT NOT NULL,
    "fullDetails" BOOLEAN NOT NULL DEFAULT false,
    "preview" JSONB NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "EventMedicalForwardingConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventRecurrenceWarning" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),

    CONSTRAINT "EventRecurrenceWarning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'person',
    "role" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "organisationId" TEXT,
    "birthday" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organisation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthCondition" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icd10Code" TEXT,
    "diagnosedDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "diagnosingDocId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthCondition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Symptom" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "severityScale" INTEGER NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Symptom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SymptomLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symptomId" TEXT NOT NULL,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "severity" INTEGER NOT NULL,
    "triggers" TEXT[],
    "notes" TEXT,
    "flareId" TEXT,

    CONSTRAINT "SymptomLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Flare" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conditionId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "severity" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Flare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VitalType" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "normalRangeLow" DOUBLE PRECISION,
    "normalRangeHigh" DOUBLE PRECISION,

    CONSTRAINT "VitalType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VitalLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vitalTypeId" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "device" TEXT,
    "notes" TEXT,

    CONSTRAINT "VitalLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'personal',
    "targetValue" DOUBLE PRECISION,
    "currentValue" DOUBLE PRECISION DEFAULT 0,
    "unit" TEXT,
    "targetDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "milestones" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "period" TEXT NOT NULL DEFAULT 'monthly',
    "category" TEXT,
    "allocatedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomeSource" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'salary',
    "employerId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'fortnightly',
    "hoursPerWeek" DOUBLE PRECISION,
    "isGross" BOOLEAN NOT NULL DEFAULT true,
    "incSuper" BOOLEAN NOT NULL DEFAULT false,
    "superRate" DOUBLE PRECISION NOT NULL DEFAULT 12,
    "payAccountId" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncomeSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryIncrease" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "incomeSourceId" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "changeType" TEXT NOT NULL DEFAULT 'percent',
    "value" DOUBLE PRECISION NOT NULL,
    "newSuperRate" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalaryIncrease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryPackaging" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Package',
    "employerId" TEXT,
    "packageType" TEXT NOT NULL DEFAULT 'recurring',
    "frequency" TEXT NOT NULL DEFAULT 'annually',
    "grossSalary" DOUBLE PRECISION NOT NULL,
    "packagedAmount" DOUBLE PRECISION NOT NULL,
    "benefitType" TEXT,
    "reportableAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gstComponent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "postTaxDeduction" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reimbursement" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3),
    "isProvisional" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalaryPackaging_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WfhDiaryEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WfhDiaryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapitalGainEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assetName" TEXT NOT NULL,
    "assetType" TEXT NOT NULL DEFAULT 'shares',
    "quantity" DOUBLE PRECISION,
    "acquireDate" TIMESTAMP(3) NOT NULL,
    "acquireCost" DOUBLE PRECISION NOT NULL,
    "disposalDate" TIMESTAMP(3),
    "disposalProceeds" DOUBLE PRECISION,
    "financialYear" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CapitalGainEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HELPDebt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "originalAmount" DOUBLE PRECISION NOT NULL,
    "currentBalance" DOUBLE PRECISION NOT NULL,
    "indexationDate" TIMESTAMP(3),
    "repaymentThreshold" DOUBLE PRECISION,
    "annualRepayment" DOUBLE PRECISION DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HELPDebt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'expense',
    "level" INTEGER NOT NULL DEFAULT 1,
    "parentId" TEXT,
    "taxCategory" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'expense',
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AUD',
    "merchant" TEXT,
    "category" TEXT,
    "subcategory" TEXT,
    "accountId" TEXT,
    "frequency" TEXT NOT NULL DEFAULT 'monthly',
    "interval" INTEGER NOT NULL DEFAULT 1,
    "anchorDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "isBill" BOOLEAN NOT NULL DEFAULT false,
    "isDeductible" BOOLEAN NOT NULL DEFAULT false,
    "taxCategory" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastGeneratedDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BnplPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "purchaseName" TEXT NOT NULL,
    "accountId" TEXT,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "deposit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "numInstalments" INTEGER NOT NULL DEFAULT 4,
    "frequency" TEXT NOT NULL DEFAULT 'fortnightly',
    "startDate" TIMESTAMP(3) NOT NULL,
    "instalmentAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "refundedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "category" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BnplPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSetting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "UserSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assetType" TEXT NOT NULL DEFAULT 'other',
    "currentValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "purchaseValue" DOUBLE PRECISION,
    "purchaseDate" TIMESTAMP(3),
    "growthRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "incomeRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ongoingCostAnnual" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "quantity" DOUBLE PRECISION,
    "unitCode" TEXT,
    "linkedAccountId" TEXT,
    "isProvisional" BOOLEAN NOT NULL DEFAULT false,
    "acquisitionDate" TIMESTAMP(3),
    "upfrontCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "linkedLiabilityId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Liability" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "liabilityType" TEXT NOT NULL DEFAULT 'other',
    "currentBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "originalAmount" DOUBLE PRECISION,
    "linkedAccountId" TEXT,
    "linkedAssetId" TEXT,
    "interestRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cashRate" DOUBLE PRECISION,
    "btRate" DOUBLE PRECISION,
    "btFee" DOUBLE PRECISION,
    "btEndDate" TIMESTAMP(3),
    "btFromLiabilityId" TEXT,
    "annualFee" DOUBLE PRECISION,
    "monthlyFee" DOUBLE PRECISION,
    "oneOffFee" DOUBLE PRECISION,
    "recurringFee" DOUBLE PRECISION,
    "recurringFeeFrequency" TEXT,
    "termMonths" INTEGER,
    "repaymentAmount" DOUBLE PRECISION,
    "repaymentFrequency" TEXT,
    "repaymentMethod" TEXT,
    "minPayment" DOUBLE PRECISION,
    "startDate" TIMESTAMP(3),
    "numRepayments" INTEGER,
    "totalFees" DOUBLE PRECISION,
    "totalInterest" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Liability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startYear" INTEGER NOT NULL,
    "numYears" INTEGER NOT NULL DEFAULT 30,
    "currentSalary" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentSuperBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentInvestments" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentCash" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "inflationRate" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "wageGrowthRate" DOUBLE PRECISION NOT NULL DEFAULT 3,
    "superReturnRate" DOUBLE PRECISION NOT NULL DEFAULT 7,
    "investmentReturnRate" DOUBLE PRECISION NOT NULL DEFAULT 6,
    "extraSuperContribution" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "annualSavings" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "retirementYear" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'expense',
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isDebtFunded" BOOLEAN NOT NULL DEFAULT false,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "endYear" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "referrerId" TEXT,
    "conditionId" TEXT,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "appointmentLimit" INTEGER,
    "appointmentsUsed" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "practitionerId" TEXT,
    "organisationId" TEXT,
    "referralId" TEXT,
    "appointmentType" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER,
    "location" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "cost" DOUBLE PRECISION,
    "medicareItem" TEXT,
    "medicareRebate" DOUBLE PRECISION,
    "outOfPocket" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabPanel" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'pathology',
    "discipline" TEXT NOT NULL DEFAULT 'other',
    "collectedDate" TIMESTAMP(3) NOT NULL,
    "provider" TEXT,
    "cloudStoragePath" TEXT,
    "summary" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabPanel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabResult" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "panelId" TEXT NOT NULL,
    "analyte" TEXT NOT NULL,
    "resultType" TEXT NOT NULL DEFAULT 'quantitative',
    "value" DOUBLE PRECISION,
    "valueText" TEXT,
    "unit" TEXT,
    "refLow" DOUBLE PRECISION,
    "refHigh" DOUBLE PRECISION,
    "flag" TEXT,
    "notes" TEXT,

    CONSTRAINT "LabResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicareClaim" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serviceDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "itemNumber" TEXT,
    "provider" TEXT,
    "scheduleFee" DOUBLE PRECISION,
    "feeCharged" DOUBLE PRECISION,
    "benefitPaid" DOUBLE PRECISION,
    "outOfPocket" DOUBLE PRECISION DEFAULT 0,
    "financialYear" TEXT,
    "countsToSafetyNet" BOOLEAN NOT NULL DEFAULT true,
    "isForecast" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicareClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhiPolicy" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "insurerId" TEXT,
    "policyName" TEXT NOT NULL,
    "policyNumber" TEXT,
    "coverType" TEXT NOT NULL DEFAULT 'combined',
    "premium" DOUBLE PRECISION,
    "premiumFrequency" TEXT,
    "excess" DOUBLE PRECISION,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhiPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhiTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhiTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhiLimit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "annualLimit" DOUBLE PRECISION,
    "usedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "PhiLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutritionLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mealType" TEXT,
    "description" TEXT NOT NULL,
    "kilojoules" DOUBLE PRECISION,
    "protein" DOUBLE PRECISION,
    "carbs" DOUBLE PRECISION,
    "fat" DOUBLE PRECISION,
    "hydrationMl" DOUBLE PRECISION,
    "notes" TEXT,

    CONSTRAINT "NutritionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoodLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mood" INTEGER NOT NULL,
    "energy" INTEGER NOT NULL,
    "anxiety" INTEGER,
    "questionnaire" TEXT,
    "score" INTEGER,
    "journal" TEXT,
    "notes" TEXT,

    CONSTRAINT "MoodLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "medicationId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "quantityChange" DOUBLE PRECISION NOT NULL,
    "balanceAfter" DOUBLE PRECISION NOT NULL,
    "countedQuantity" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WfhPattern" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayOfWeek" INTEGER[],
    "hours" DOUBLE PRECISION NOT NULL DEFAULT 7.6,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WfhPattern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "leaveType" TEXT NOT NULL DEFAULT 'annual',
    "hoursPerDay" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicHoliday" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_MedicationConditions" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_MedicationConditions_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ConditionSymptoms" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ConditionSymptoms_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_providerAccountId_key" ON "accounts"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "Medication_userId_idx" ON "Medication"("userId");

-- CreateIndex
CREATE INDEX "Prescription_userId_idx" ON "Prescription"("userId");

-- CreateIndex
CREATE INDEX "Prescription_medicationId_idx" ON "Prescription"("medicationId");

-- CreateIndex
CREATE INDEX "DosageSchedule_userId_idx" ON "DosageSchedule"("userId");

-- CreateIndex
CREATE INDEX "DosageSchedule_prescriptionId_idx" ON "DosageSchedule"("prescriptionId");

-- CreateIndex
CREATE INDEX "DosageSchedule_medicationId_idx" ON "DosageSchedule"("medicationId");

-- CreateIndex
CREATE INDEX "MedicationLog_userId_idx" ON "MedicationLog"("userId");

-- CreateIndex
CREATE INDEX "MedicationLog_scheduleId_idx" ON "MedicationLog"("scheduleId");

-- CreateIndex
CREATE INDEX "MedicationLog_takenAt_idx" ON "MedicationLog"("takenAt");

-- CreateIndex
CREATE INDEX "StockLevel_userId_idx" ON "StockLevel"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StockLevel_userId_medicationId_key" ON "StockLevel"("userId", "medicationId");

-- CreateIndex
CREATE INDEX "FinAccount_userId_idx" ON "FinAccount"("userId");

-- CreateIndex
CREATE INDEX "Transaction_userId_idx" ON "Transaction"("userId");

-- CreateIndex
CREATE INDEX "Transaction_date_idx" ON "Transaction"("date");

-- CreateIndex
CREATE INDEX "Transaction_accountId_idx" ON "Transaction"("accountId");

-- CreateIndex
CREATE INDEX "Transaction_category_idx" ON "Transaction"("category");

-- CreateIndex
CREATE INDEX "TransactionAuditRecord_userId_idx" ON "TransactionAuditRecord"("userId");

-- CreateIndex
CREATE INDEX "TransactionAuditRecord_transactionId_idx" ON "TransactionAuditRecord"("transactionId");

-- CreateIndex
CREATE INDEX "TransactionAuditRecord_createdAt_idx" ON "TransactionAuditRecord"("createdAt");

-- CreateIndex
CREATE INDEX "CsvImport_userId_idx" ON "CsvImport"("userId");

-- CreateIndex
CREATE INDEX "Task_userId_idx" ON "Task"("userId");

-- CreateIndex
CREATE INDEX "Task_status_idx" ON "Task"("status");

-- CreateIndex
CREATE INDEX "Task_dueDate_idx" ON "Task"("dueDate");

-- CreateIndex
CREATE INDEX "Task_projectId_idx" ON "Task"("projectId");

-- CreateIndex
CREATE INDEX "Project_userId_idx" ON "Project"("userId");

-- CreateIndex
CREATE INDEX "Event_userId_idx" ON "Event"("userId");

-- CreateIndex
CREATE INDEX "Event_startDatetime_idx" ON "Event"("startDatetime");

-- CreateIndex
CREATE INDEX "Event_type_idx" ON "Event"("type");

-- CreateIndex
CREATE INDEX "Event_externalProvider_externalCalendarId_externalEventId_idx" ON "Event"("externalProvider", "externalCalendarId", "externalEventId");

-- CreateIndex
CREATE INDEX "Event_syncStatus_idx" ON "Event"("syncStatus");

-- CreateIndex
CREATE INDEX "CalendarProviderConnection_userId_provider_idx" ON "CalendarProviderConnection"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarProviderConnection_userId_provider_providerAccountI_key" ON "CalendarProviderConnection"("userId", "provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarSyncSetting_connectionId_externalCalendarId_key" ON "CalendarSyncSetting"("connectionId", "externalCalendarId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarSyncCursor_connectionId_externalCalendarId_key" ON "CalendarSyncCursor"("connectionId", "externalCalendarId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarSyncJob_idempotencyKey_key" ON "CalendarSyncJob"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CalendarSyncJob_connectionId_status_scheduledAt_idx" ON "CalendarSyncJob"("connectionId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "CalendarSyncConflict_eventId_resolvedAt_idx" ON "CalendarSyncConflict"("eventId", "resolvedAt");

-- CreateIndex
CREATE INDEX "CalendarInviteRule_userId_enabled_idx" ON "CalendarInviteRule"("userId", "enabled");

-- CreateIndex
CREATE INDEX "EventInviteDecision_ruleId_idx" ON "EventInviteDecision"("ruleId");

-- CreateIndex
CREATE UNIQUE INDEX "EventInviteDecision_eventId_personId_key" ON "EventInviteDecision"("eventId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarIdempotencyKey_userId_operation_key_key" ON "CalendarIdempotencyKey"("userId", "operation", "key");

-- CreateIndex
CREATE INDEX "CalendarAuditRecord_userId_createdAt_idx" ON "CalendarAuditRecord"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CalendarAuditRecord_eventId_idx" ON "CalendarAuditRecord"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "PrivateTravelBlock_eventId_key" ON "PrivateTravelBlock"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "EventMedicalForwardingConsent_eventId_destinationCalendarId_key" ON "EventMedicalForwardingConsent"("eventId", "destinationCalendarId");

-- CreateIndex
CREATE UNIQUE INDEX "EventRecurrenceWarning_eventId_code_key" ON "EventRecurrenceWarning"("eventId", "code");

-- CreateIndex
CREATE INDEX "Person_userId_idx" ON "Person"("userId");

-- CreateIndex
CREATE INDEX "Organisation_userId_idx" ON "Organisation"("userId");

-- CreateIndex
CREATE INDEX "HealthCondition_userId_idx" ON "HealthCondition"("userId");

-- CreateIndex
CREATE INDEX "Symptom_userId_idx" ON "Symptom"("userId");

-- CreateIndex
CREATE INDEX "SymptomLog_userId_idx" ON "SymptomLog"("userId");

-- CreateIndex
CREATE INDEX "SymptomLog_loggedAt_idx" ON "SymptomLog"("loggedAt");

-- CreateIndex
CREATE INDEX "Flare_userId_idx" ON "Flare"("userId");

-- CreateIndex
CREATE INDEX "VitalType_userId_idx" ON "VitalType"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VitalType_userId_name_key" ON "VitalType"("userId", "name");

-- CreateIndex
CREATE INDEX "VitalLog_userId_idx" ON "VitalLog"("userId");

-- CreateIndex
CREATE INDEX "VitalLog_loggedAt_idx" ON "VitalLog"("loggedAt");

-- CreateIndex
CREATE INDEX "Goal_userId_idx" ON "Goal"("userId");

-- CreateIndex
CREATE INDEX "Budget_userId_idx" ON "Budget"("userId");

-- CreateIndex
CREATE INDEX "IncomeSource_userId_idx" ON "IncomeSource"("userId");

-- CreateIndex
CREATE INDEX "SalaryIncrease_userId_idx" ON "SalaryIncrease"("userId");

-- CreateIndex
CREATE INDEX "SalaryIncrease_incomeSourceId_idx" ON "SalaryIncrease"("incomeSourceId");

-- CreateIndex
CREATE INDEX "SalaryPackaging_userId_idx" ON "SalaryPackaging"("userId");

-- CreateIndex
CREATE INDEX "WfhDiaryEntry_userId_idx" ON "WfhDiaryEntry"("userId");

-- CreateIndex
CREATE INDEX "WfhDiaryEntry_date_idx" ON "WfhDiaryEntry"("date");

-- CreateIndex
CREATE INDEX "CapitalGainEvent_userId_idx" ON "CapitalGainEvent"("userId");

-- CreateIndex
CREATE INDEX "HELPDebt_userId_idx" ON "HELPDebt"("userId");

-- CreateIndex
CREATE INDEX "Category_userId_idx" ON "Category"("userId");

-- CreateIndex
CREATE INDEX "Category_parentId_idx" ON "Category"("parentId");

-- CreateIndex
CREATE INDEX "RecurringTransaction_userId_idx" ON "RecurringTransaction"("userId");

-- CreateIndex
CREATE INDEX "RecurringTransaction_isActive_idx" ON "RecurringTransaction"("isActive");

-- CreateIndex
CREATE INDEX "BnplPlan_userId_idx" ON "BnplPlan"("userId");

-- CreateIndex
CREATE INDEX "UserSetting_userId_idx" ON "UserSetting"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSetting_userId_key_key" ON "UserSetting"("userId", "key");

-- CreateIndex
CREATE INDEX "Asset_userId_idx" ON "Asset"("userId");

-- CreateIndex
CREATE INDEX "Liability_userId_idx" ON "Liability"("userId");

-- CreateIndex
CREATE INDEX "FinancialPlan_userId_idx" ON "FinancialPlan"("userId");

-- CreateIndex
CREATE INDEX "PlanEvent_userId_idx" ON "PlanEvent"("userId");

-- CreateIndex
CREATE INDEX "PlanEvent_planId_idx" ON "PlanEvent"("planId");

-- CreateIndex
CREATE INDEX "Referral_userId_idx" ON "Referral"("userId");

-- CreateIndex
CREATE INDEX "Appointment_userId_idx" ON "Appointment"("userId");

-- CreateIndex
CREATE INDEX "Appointment_startTime_idx" ON "Appointment"("startTime");

-- CreateIndex
CREATE INDEX "LabPanel_userId_idx" ON "LabPanel"("userId");

-- CreateIndex
CREATE INDEX "LabResult_userId_idx" ON "LabResult"("userId");

-- CreateIndex
CREATE INDEX "LabResult_panelId_idx" ON "LabResult"("panelId");

-- CreateIndex
CREATE INDEX "MedicareClaim_userId_idx" ON "MedicareClaim"("userId");

-- CreateIndex
CREATE INDEX "MedicareClaim_serviceDate_idx" ON "MedicareClaim"("serviceDate");

-- CreateIndex
CREATE INDEX "PhiPolicy_userId_idx" ON "PhiPolicy"("userId");

-- CreateIndex
CREATE INDEX "PhiTransaction_userId_idx" ON "PhiTransaction"("userId");

-- CreateIndex
CREATE INDEX "PhiTransaction_policyId_idx" ON "PhiTransaction"("policyId");

-- CreateIndex
CREATE INDEX "PhiLimit_userId_idx" ON "PhiLimit"("userId");

-- CreateIndex
CREATE INDEX "PhiLimit_policyId_idx" ON "PhiLimit"("policyId");

-- CreateIndex
CREATE INDEX "NutritionLog_userId_idx" ON "NutritionLog"("userId");

-- CreateIndex
CREATE INDEX "NutritionLog_loggedAt_idx" ON "NutritionLog"("loggedAt");

-- CreateIndex
CREATE INDEX "MoodLog_userId_idx" ON "MoodLog"("userId");

-- CreateIndex
CREATE INDEX "MoodLog_loggedAt_idx" ON "MoodLog"("loggedAt");

-- CreateIndex
CREATE INDEX "StockTransaction_userId_idx" ON "StockTransaction"("userId");

-- CreateIndex
CREATE INDEX "StockTransaction_medicationId_idx" ON "StockTransaction"("medicationId");

-- CreateIndex
CREATE INDEX "StockTransaction_date_idx" ON "StockTransaction"("date");

-- CreateIndex
CREATE INDEX "WfhPattern_userId_idx" ON "WfhPattern"("userId");

-- CreateIndex
CREATE INDEX "LeaveEntry_userId_idx" ON "LeaveEntry"("userId");

-- CreateIndex
CREATE INDEX "LeaveEntry_startDate_idx" ON "LeaveEntry"("startDate");

-- CreateIndex
CREATE INDEX "PublicHoliday_userId_idx" ON "PublicHoliday"("userId");

-- CreateIndex
CREATE INDEX "PublicHoliday_date_idx" ON "PublicHoliday"("date");

-- CreateIndex
CREATE INDEX "_MedicationConditions_B_index" ON "_MedicationConditions"("B");

-- CreateIndex
CREATE INDEX "_ConditionSymptoms_B_index" ON "_ConditionSymptoms"("B");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Medication" ADD CONSTRAINT "Medication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Medication" ADD CONSTRAINT "Medication_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Medication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "Medication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_prescriberId_fkey" FOREIGN KEY ("prescriberId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DosageSchedule" ADD CONSTRAINT "DosageSchedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DosageSchedule" ADD CONSTRAINT "DosageSchedule_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DosageSchedule" ADD CONSTRAINT "DosageSchedule_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "Medication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationLog" ADD CONSTRAINT "MedicationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationLog" ADD CONSTRAINT "MedicationLog_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "DosageSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "Medication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinAccount" ADD CONSTRAINT "FinAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_csvImportId_fkey" FOREIGN KEY ("csvImportId") REFERENCES "CsvImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionAuditRecord" ADD CONSTRAINT "TransactionAuditRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsvImport" ADD CONSTRAINT "CsvImport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarProviderConnection" ADD CONSTRAINT "CalendarProviderConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarSyncSetting" ADD CONSTRAINT "CalendarSyncSetting_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "CalendarProviderConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarSyncCursor" ADD CONSTRAINT "CalendarSyncCursor_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "CalendarProviderConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarSyncJob" ADD CONSTRAINT "CalendarSyncJob_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "CalendarProviderConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarSyncConflict" ADD CONSTRAINT "CalendarSyncConflict_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarSyncConflict" ADD CONSTRAINT "CalendarSyncConflict_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "CalendarProviderConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarInviteRule" ADD CONSTRAINT "CalendarInviteRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventInviteDecision" ADD CONSTRAINT "EventInviteDecision_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventInviteDecision" ADD CONSTRAINT "EventInviteDecision_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "CalendarInviteRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarIdempotencyKey" ADD CONSTRAINT "CalendarIdempotencyKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarAuditRecord" ADD CONSTRAINT "CalendarAuditRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarAuditRecord" ADD CONSTRAINT "CalendarAuditRecord_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivateTravelBlock" ADD CONSTRAINT "PrivateTravelBlock_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventMedicalForwardingConsent" ADD CONSTRAINT "EventMedicalForwardingConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventMedicalForwardingConsent" ADD CONSTRAINT "EventMedicalForwardingConsent_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventMedicalForwardingConsent" ADD CONSTRAINT "EventMedicalForwardingConsent_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "CalendarProviderConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRecurrenceWarning" ADD CONSTRAINT "EventRecurrenceWarning_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Organisation" ADD CONSTRAINT "Organisation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthCondition" ADD CONSTRAINT "HealthCondition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Symptom" ADD CONSTRAINT "Symptom_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SymptomLog" ADD CONSTRAINT "SymptomLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SymptomLog" ADD CONSTRAINT "SymptomLog_symptomId_fkey" FOREIGN KEY ("symptomId") REFERENCES "Symptom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SymptomLog" ADD CONSTRAINT "SymptomLog_flareId_fkey" FOREIGN KEY ("flareId") REFERENCES "Flare"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flare" ADD CONSTRAINT "Flare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flare" ADD CONSTRAINT "Flare_conditionId_fkey" FOREIGN KEY ("conditionId") REFERENCES "HealthCondition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VitalType" ADD CONSTRAINT "VitalType_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VitalLog" ADD CONSTRAINT "VitalLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VitalLog" ADD CONSTRAINT "VitalLog_vitalTypeId_fkey" FOREIGN KEY ("vitalTypeId") REFERENCES "VitalType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeSource" ADD CONSTRAINT "IncomeSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryIncrease" ADD CONSTRAINT "SalaryIncrease_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryIncrease" ADD CONSTRAINT "SalaryIncrease_incomeSourceId_fkey" FOREIGN KEY ("incomeSourceId") REFERENCES "IncomeSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryPackaging" ADD CONSTRAINT "SalaryPackaging_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WfhDiaryEntry" ADD CONSTRAINT "WfhDiaryEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapitalGainEvent" ADD CONSTRAINT "CapitalGainEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HELPDebt" ADD CONSTRAINT "HELPDebt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringTransaction" ADD CONSTRAINT "RecurringTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BnplPlan" ADD CONSTRAINT "BnplPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSetting" ADD CONSTRAINT "UserSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Liability" ADD CONSTRAINT "Liability_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialPlan" ADD CONSTRAINT "FinancialPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanEvent" ADD CONSTRAINT "PlanEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanEvent" ADD CONSTRAINT "PlanEvent_planId_fkey" FOREIGN KEY ("planId") REFERENCES "FinancialPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_conditionId_fkey" FOREIGN KEY ("conditionId") REFERENCES "HealthCondition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabPanel" ADD CONSTRAINT "LabPanel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabResult" ADD CONSTRAINT "LabResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabResult" ADD CONSTRAINT "LabResult_panelId_fkey" FOREIGN KEY ("panelId") REFERENCES "LabPanel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicareClaim" ADD CONSTRAINT "MedicareClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhiPolicy" ADD CONSTRAINT "PhiPolicy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhiPolicy" ADD CONSTRAINT "PhiPolicy_insurerId_fkey" FOREIGN KEY ("insurerId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhiTransaction" ADD CONSTRAINT "PhiTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhiTransaction" ADD CONSTRAINT "PhiTransaction_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "PhiPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhiLimit" ADD CONSTRAINT "PhiLimit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhiLimit" ADD CONSTRAINT "PhiLimit_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "PhiPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionLog" ADD CONSTRAINT "NutritionLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoodLog" ADD CONSTRAINT "MoodLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "Medication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WfhPattern" ADD CONSTRAINT "WfhPattern_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveEntry" ADD CONSTRAINT "LeaveEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicHoliday" ADD CONSTRAINT "PublicHoliday_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MedicationConditions" ADD CONSTRAINT "_MedicationConditions_A_fkey" FOREIGN KEY ("A") REFERENCES "HealthCondition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MedicationConditions" ADD CONSTRAINT "_MedicationConditions_B_fkey" FOREIGN KEY ("B") REFERENCES "Medication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ConditionSymptoms" ADD CONSTRAINT "_ConditionSymptoms_A_fkey" FOREIGN KEY ("A") REFERENCES "HealthCondition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ConditionSymptoms" ADD CONSTRAINT "_ConditionSymptoms_B_fkey" FOREIGN KEY ("B") REFERENCES "Symptom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

