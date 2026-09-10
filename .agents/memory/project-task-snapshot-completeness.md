---
name: Project task snapshot completeness
description: How to avoid silently incomplete project-task snapshots when maintaining the priority register.
---

Treat a project-task query as incomplete whenever its returned task count is lower than `totalCount`,
even when the total is below the documented 100-task cap. Partition active queries by state and
reconcile missing references in small exact-ref batches before marking the snapshot complete.

**Why:** The task service can trim a response because of its total payload budget, so a nominally
small query returned fewer pending tasks than its reported total. Trusting the returned array would
silently remove active work from release planning.

**How to apply:** When refreshing the versioned priority register, compare deduplicated active refs
with the sum of state-partition totals, fetch omitted refs in small batches, hydrate the full
dependency closure, and set the snapshot completeness marker only after the counts match. Normalize
`MAIN_PENDING` under the pending partition and `MAIN_IN_PROGRESS` under the in-progress partition.