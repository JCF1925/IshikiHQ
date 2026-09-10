---
name: Income browser acceptance
description: Authenticated income browser checks need a fully migrated disposable schema when development databases lag the committed Prisma schema.
---

Use a disposable PostgreSQL schema with all committed Prisma migrations and seed data for browser acceptance of income persistence. The shared development database can be behind the current schema, causing unrelated dashboard or income reads to fail before the UI flow is exercised.

**Why:** The income UI reads the current Prisma model shape, while the shared development database may not have the latest review columns or unrelated model fields. Mutating that shared database to validate one browser test risks interfering with other work.

**How to apply:** Keep the browser test real and authenticated, but run it against a temporary migrated schema in validation; treat failures on the stale shared schema as environment drift rather than weakening the test with API mocks.

The managed Next development server holds a project-wide `.next` lock, so starting another server on a different port does not isolate a browser run. Use the project’s disposable-schema release-gate flow or stop/isolate the managed server before running against a temporary schema.

**Why:** A second server attempt can fail before Playwright starts even when its port is free, while pointing Playwright at the managed server would silently exercise a different database.

**How to apply:** Do not combine a temporary `DATABASE_URL` with `PLAYWRIGHT_BASE_URL` pointed at the managed server; the server and test process must share the same migrated schema.