ALTER TABLE "Goal" ADD CONSTRAINT "Goal_id_userId_key" UNIQUE ("id", "userId");

CREATE TABLE "GoalProgressEntry" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "goalId" TEXT NOT NULL,
  "value" DOUBLE PRECISION NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GoalProgressEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GoalProgressEntry_userId_goalId_recordedAt_idx"
  ON "GoalProgressEntry"("userId", "goalId", "recordedAt");

ALTER TABLE "GoalProgressEntry"
  ADD CONSTRAINT "GoalProgressEntry_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GoalProgressEntry"
  ADD CONSTRAINT "GoalProgressEntry_goalId_userId_fkey"
  FOREIGN KEY ("goalId", "userId") REFERENCES "Goal"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing measurable goals get a baseline entry without requiring user action.
INSERT INTO "GoalProgressEntry" ("id", "userId", "goalId", "value", "recordedAt", "createdAt")
SELECT 'goal_progress_' || md5("id"), "userId", "id", COALESCE("currentValue", 0), "updatedAt", CURRENT_TIMESTAMP
FROM "Goal"
WHERE "targetValue" IS NOT NULL;