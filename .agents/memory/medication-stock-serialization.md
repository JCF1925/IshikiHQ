---
name: Medication stock serialization
description: PostgreSQL behavior to preserve when testing serialized medication stock writes.
---

Serializable transactions can still raise `P2034` when concurrent requests establish snapshots before waiting on the same PostgreSQL advisory lock. A bounded, deterministic retry backoff is required even when the lock protects the critical section.

**Why:** A burst of valid dispense, dose, or stock requests can otherwise exhaust a small retry budget and surface avoidable 500 responses despite the serialized business operation being safe.

**How to apply:** Keep medication stock acceptance tests database-backed and run them as concurrent requests against a disposable migrated schema; assert both the retry budget and the final ledger/stock invariant. When a locked row is selected through nullable joins, use PostgreSQL's `FOR UPDATE OF <base-table>` form rather than locking the whole join.