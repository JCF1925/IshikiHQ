---
name: Health-claims database acceptance
description: Environment rule for running authenticated health-claims route coverage.
---

Health-claims database acceptance must use a disposable schema with committed Prisma migrations applied; the default development database may intentionally lag behind new health-claims tables.

**Why:** The route tests need real ownership, transaction, and deduplication behavior, but applying migrations to a shared development schema can affect unrelated work.

**How to apply:** Generate the Prisma client first, create a temporary PostgreSQL schema, deploy every committed migration into it, and run the opt-in acceptance test with that schema's `DATABASE_URL`. If migration ordering blocks the gate, fix the committed ordering or report the blocker; do not bypass the migration gate.

Keep parser and review-edit unit cases in their own suites, separate from the opt-in database acceptance block.

**Why:** A malformed merge in the large acceptance file can otherwise make fixture failures look like parser regressions or prevent the required module-mocking runner from collecting any tests.

**How to apply:** Repair syntax and suite boundaries first, then run the focused module-mocking command before investigating behavior or database setup.