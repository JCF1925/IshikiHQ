CREATE TYPE "WorkProposalStatus" AS ENUM ('pending', 'approved', 'rejected');

ALTER TABLE "SalaryIncrease"
  ADD COLUMN "status" "WorkProposalStatus" NOT NULL DEFAULT 'pending',
  ADD COLUMN "decidedAt" TIMESTAMP(3),
  ADD COLUMN "decisionNotes" TEXT;

-- Existing increases were already reflected in forecasts before review existed.
UPDATE "SalaryIncrease" SET "status" = 'approved', "decidedAt" = "createdAt";

ALTER TABLE "Project" ADD COLUMN "organisationId" TEXT;
ALTER TABLE "Event" ADD COLUMN "projectId" TEXT;
ALTER TABLE "Project" DROP CONSTRAINT "Project_goalId_fkey";

CREATE TABLE "EmploymentRole" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "organisationId" TEXT NOT NULL,
  "incomeSourceId" TEXT,
  "title" TEXT NOT NULL,
  "employmentType" TEXT NOT NULL DEFAULT 'employee',
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmploymentRole_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmploymentCompensation" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "amount" DOUBLE PRECISION NOT NULL,
  "frequency" TEXT NOT NULL DEFAULT 'annually',
  "hoursPerWeek" DOUBLE PRECISION,
  "currency" TEXT NOT NULL DEFAULT 'AUD',
  "superRate" DOUBLE PRECISION,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmploymentCompensation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Project_organisationId_idx" ON "Project"("organisationId");
CREATE INDEX "Project_goalId_idx" ON "Project"("goalId");
CREATE INDEX "Event_projectId_idx" ON "Event"("projectId");
CREATE INDEX "EmploymentRole_userId_startDate_idx" ON "EmploymentRole"("userId", "startDate");
CREATE INDEX "EmploymentRole_organisationId_idx" ON "EmploymentRole"("organisationId");
CREATE INDEX "EmploymentRole_incomeSourceId_idx" ON "EmploymentRole"("incomeSourceId");
CREATE UNIQUE INDEX "EmploymentCompensation_roleId_effectiveFrom_key" ON "EmploymentCompensation"("roleId", "effectiveFrom");
CREATE INDEX "EmploymentCompensation_userId_effectiveFrom_idx" ON "EmploymentCompensation"("userId", "effectiveFrom");

ALTER TABLE "Project" ADD CONSTRAINT "Project_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Event" ADD CONSTRAINT "Event_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmploymentRole" ADD CONSTRAINT "EmploymentRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmploymentRole" ADD CONSTRAINT "EmploymentRole_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmploymentRole" ADD CONSTRAINT "EmploymentRole_incomeSourceId_fkey" FOREIGN KEY ("incomeSourceId") REFERENCES "IncomeSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmploymentCompensation" ADD CONSTRAINT "EmploymentCompensation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmploymentCompensation" ADD CONSTRAINT "EmploymentCompensation_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "EmploymentRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;