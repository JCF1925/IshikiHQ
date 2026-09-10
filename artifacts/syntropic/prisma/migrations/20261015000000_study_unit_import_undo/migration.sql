CREATE TABLE "StudyUnitImportBatch" (
  "id" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "undoneAt" TIMESTAMP(3),
  CONSTRAINT "StudyUnitImportBatch_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "StudyUnit" ADD COLUMN "importBatchId" TEXT;

CREATE INDEX "StudyUnitImportBatch_programId_createdAt_idx"
  ON "StudyUnitImportBatch"("programId", "createdAt");
CREATE INDEX "StudyUnit_importBatchId_idx"
  ON "StudyUnit"("importBatchId");

ALTER TABLE "StudyUnitImportBatch"
  ADD CONSTRAINT "StudyUnitImportBatch_programId_fkey"
  FOREIGN KEY ("programId") REFERENCES "StudyProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudyUnit"
  ADD CONSTRAINT "StudyUnit_importBatchId_fkey"
  FOREIGN KEY ("importBatchId") REFERENCES "StudyUnitImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;