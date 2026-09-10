---
name: Mobile canonical acceptance
description: Mobile capture acceptance must distinguish staging IDs from canonical IDs and exercise required Prisma timestamps.
---

Mobile capture responses identify the staged `MobileRecord`; the canonical dashboard row is materialised with a separate UUID. Acceptance checks should locate canonical rows by their captured business fields and verify sync changes against the staged ID.

**Why:** The bridge intentionally stores a staging record and dashboard record in one transaction, but returning or querying the staging ID as if it were the canonical ID can make a successful capture look missing.

**How to apply:** When adding mobile capture coverage, assert all three layers independently: canonical row, `MobileRecord`, and `MobileSyncChange`. Direct SQL inserts into Prisma-owned dashboard tables must also provide non-default `updatedAt` columns.