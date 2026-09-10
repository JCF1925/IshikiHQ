-- Google OAuth connections cannot be safely reconnected without the provider
-- account identity. Retire legacy unidentified Google rows instead of
-- inventing an identity that a future callback could accidentally match.
UPDATE "CalendarProviderConnection"
SET
  "status" = 'disabled',
  "disconnectedAt" = COALESCE("disconnectedAt", CURRENT_TIMESTAMP),
  "credentialReference" = NULL,
  "lastSyncError" = COALESCE(
    "lastSyncError",
    'Calendar connection requires reconnecting to identify the provider account'
  ),
  "providerAccountId" = 'legacy:' || "id"
WHERE "provider" = 'google'
  AND "providerAccountId" IS NULL;

ALTER TABLE "CalendarProviderConnection"
  ADD CONSTRAINT "CalendarProviderConnection_google_providerAccountId_check"
  CHECK ("provider" <> 'google' OR "providerAccountId" IS NOT NULL);

-- PostgreSQL treats NULL values as distinct in a normal unique constraint.
-- Keep at most one unidentified connection for providers that do not yet have
-- a stable account identity, so unknown connections cannot multiply silently.
CREATE UNIQUE INDEX "CalendarProviderConnection_userId_provider_null_account_key"
  ON "CalendarProviderConnection" ("userId", "provider")
  WHERE "providerAccountId" IS NULL;