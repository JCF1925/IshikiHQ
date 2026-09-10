ALTER TABLE "LabPanel" ADD COLUMN "sourceReportId" TEXT;
UPDATE "LabPanel" AS panel
SET "sourceReportId" = report."id"
FROM "PathologyReport" AS report
WHERE report."confirmedPanelId" = panel."id";
ALTER TABLE "LabPanel" ADD CONSTRAINT "LabPanel_sourceReportId_fkey" FOREIGN KEY ("sourceReportId") REFERENCES "PathologyReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "LabPanel_sourceReportId_idx" ON "LabPanel"("sourceReportId");
ALTER TABLE "PathologyReport" DROP CONSTRAINT "PathologyReport_confirmedPanelId_fkey";
DROP INDEX "PathologyReport_confirmedPanelId_key";
ALTER TABLE "PathologyReport" DROP COLUMN "confirmedPanelId";