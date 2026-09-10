CREATE TYPE "StudyRecordStatus" AS ENUM ('planned', 'active', 'completed', 'withdrawn', 'failed', 'credited', 'archived');
CREATE TYPE "StudyGradingMethod" AS ENUM ('percentage', 'wam', 'gpa4', 'gpa7', 'pass_fail', 'competency', 'custom');
CREATE TYPE "StudySuggestionStatus" AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE "StudyProgram" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "institution" TEXT,
  "code" TEXT,
  "status" "StudyRecordStatus" NOT NULL DEFAULT 'active',
  "gradingMethod" "StudyGradingMethod" NOT NULL DEFAULT 'percentage',
  "startDate" TIMESTAMP(3),
  "expectedEndDate" TIMESTAMP(3),
  "calendarCategory" TEXT,
  "syncAssessmentCalendar" BOOLEAN NOT NULL DEFAULT false,
  "syncDeadlineCalendar" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudyProgram_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudyRequirement" (
  "id" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "requiredCredits" DECIMAL(10,2),
  "status" "StudyRecordStatus" NOT NULL DEFAULT 'planned',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudyRequirement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudyTeachingPeriod" (
  "id" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "censusDate" TIMESTAMP(3),
  "withdrawalDate" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudyTeachingPeriod_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudyUnit" (
  "id" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "teachingPeriodId" TEXT,
  "requirementId" TEXT,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "creditPoints" DECIMAL(10,2),
  "status" "StudyRecordStatus" NOT NULL DEFAULT 'planned',
  "gradingMethod" "StudyGradingMethod",
  "finalValue" DECIMAL(12,4),
  "finalOutcome" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudyUnit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudyAssessment" (
  "id" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "dueAt" TIMESTAMP(3),
  "weight" DECIMAL(7,4),
  "status" "StudyRecordStatus" NOT NULL DEFAULT 'planned',
  "resultValue" DECIMAL(12,4),
  "resultOutcome" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudyAssessment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudyAssessmentComponent" (
  "id" TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "weight" DECIMAL(7,4),
  "maximumValue" DECIMAL(12,4),
  "achievedValue" DECIMAL(12,4),
  "outcome" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudyAssessmentComponent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudyGradingScale" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "programId" TEXT,
  "name" TEXT NOT NULL,
  "method" "StudyGradingMethod" NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "maximumValue" DECIMAL(12,4),
  "rules" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudyGradingScale_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudyTaskSuggestion" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "assessmentId" TEXT,
  "kind" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "dueAt" TIMESTAMP(3),
  "status" "StudySuggestionStatus" NOT NULL DEFAULT 'pending',
  "taskId" TEXT,
  "eventId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt" TIMESTAMP(3),
  CONSTRAINT "StudyTaskSuggestion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StudyProgram_userId_status_idx" ON "StudyProgram"("userId", "status");
CREATE INDEX "StudyRequirement_programId_idx" ON "StudyRequirement"("programId");
CREATE INDEX "StudyTeachingPeriod_programId_startDate_idx" ON "StudyTeachingPeriod"("programId", "startDate");
CREATE UNIQUE INDEX "StudyUnit_programId_code_key" ON "StudyUnit"("programId", "code");
CREATE INDEX "StudyUnit_programId_status_idx" ON "StudyUnit"("programId", "status");
CREATE INDEX "StudyUnit_teachingPeriodId_idx" ON "StudyUnit"("teachingPeriodId");
CREATE INDEX "StudyAssessment_unitId_dueAt_idx" ON "StudyAssessment"("unitId", "dueAt");
CREATE INDEX "StudyAssessmentComponent_assessmentId_idx" ON "StudyAssessmentComponent"("assessmentId");
CREATE INDEX "StudyGradingScale_userId_method_effectiveFrom_idx" ON "StudyGradingScale"("userId", "method", "effectiveFrom");
CREATE INDEX "StudyGradingScale_programId_effectiveFrom_idx" ON "StudyGradingScale"("programId", "effectiveFrom");
CREATE UNIQUE INDEX "StudyTaskSuggestion_userId_idempotencyKey_key" ON "StudyTaskSuggestion"("userId", "idempotencyKey");
CREATE INDEX "StudyTaskSuggestion_userId_status_idx" ON "StudyTaskSuggestion"("userId", "status");

ALTER TABLE "StudyProgram" ADD CONSTRAINT "StudyProgram_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudyRequirement" ADD CONSTRAINT "StudyRequirement_programId_fkey" FOREIGN KEY ("programId") REFERENCES "StudyProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudyTeachingPeriod" ADD CONSTRAINT "StudyTeachingPeriod_programId_fkey" FOREIGN KEY ("programId") REFERENCES "StudyProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudyUnit" ADD CONSTRAINT "StudyUnit_programId_fkey" FOREIGN KEY ("programId") REFERENCES "StudyProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudyUnit" ADD CONSTRAINT "StudyUnit_teachingPeriodId_fkey" FOREIGN KEY ("teachingPeriodId") REFERENCES "StudyTeachingPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudyUnit" ADD CONSTRAINT "StudyUnit_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "StudyRequirement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudyAssessment" ADD CONSTRAINT "StudyAssessment_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "StudyUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudyAssessmentComponent" ADD CONSTRAINT "StudyAssessmentComponent_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "StudyAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudyGradingScale" ADD CONSTRAINT "StudyGradingScale_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudyGradingScale" ADD CONSTRAINT "StudyGradingScale_programId_fkey" FOREIGN KEY ("programId") REFERENCES "StudyProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudyTaskSuggestion" ADD CONSTRAINT "StudyTaskSuggestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudyTaskSuggestion" ADD CONSTRAINT "StudyTaskSuggestion_programId_fkey" FOREIGN KEY ("programId") REFERENCES "StudyProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudyTaskSuggestion" ADD CONSTRAINT "StudyTaskSuggestion_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "StudyAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
