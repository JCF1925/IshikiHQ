-- Repair the income review columns for development databases that reached the
-- committed schema with an older/incomplete work-beta migration.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WorkProposalStatus') THEN
    CREATE TYPE "WorkProposalStatus" AS ENUM ('pending', 'approved', 'rejected');
  END IF;
END $$;

ALTER TABLE "SalaryIncrease"
  ADD COLUMN IF NOT EXISTS "status" "WorkProposalStatus" NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS "decidedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "decisionNotes" TEXT;

-- Rows created before proposal review existed were already part of forecasts.
UPDATE "SalaryIncrease"
SET "status" = 'approved', "decidedAt" = COALESCE("decidedAt", "createdAt")
WHERE "status" = 'pending' AND "decidedAt" IS NULL;