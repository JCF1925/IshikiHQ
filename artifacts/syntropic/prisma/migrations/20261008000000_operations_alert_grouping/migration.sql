-- Keep privacy-boundary operational alerts grouped across application instances.
-- This table intentionally stores only a fixed event key, an aggregate count,
-- and coarse timing metadata. It must never contain claim or request data,
-- credentials, or record identifiers.
CREATE TABLE "OperationsAlertGroup" (
  "key" TEXT NOT NULL,
  "windowStartedAt" TIMESTAMP(3) NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OperationsAlertGroup_pkey" PRIMARY KEY ("key")
);