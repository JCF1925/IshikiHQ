---
name: Task priority reconciliation
description: Reliable refresh behavior when the project-task service truncates or rate-limits queue reads.
---

The project-task service may truncate state queries and reject large or concurrent exact-reference batches. Reconcile a priority-register refresh with small exact-reference reads, allowing cooldowns between batches when needed, and fail closed until every dependency reference is present.

**Why:** A broad queue query can report an incomplete task count, while large parallel reads can fail with a generic task-service error. Writing a partial export would leave the register stale or omit active work.

**How to apply:** Treat `totalCount` and `truncated` as completeness signals. Use exact-reference batches small enough for the service, combine them with the previous register only after applying current state records, resolve every dependency, and run the register check before delivering the refresh.