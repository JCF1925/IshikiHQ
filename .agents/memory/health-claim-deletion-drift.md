---
name: Composite ownership cleanup
description: Cleanup rule for legacy rows behind composite ownership relations.
---

When a child relation includes both a parent ID and an owner ID, cleanup for an account must select child rows by the deleting account's parent IDs as well as by direct owner ID.

**Why:** A legacy child whose owner differs from its parent's owner cannot match a composite relation filter, even though it is still private data belonging to the account through the parent. Deletion that relies only on the relation filter leaves the drifted payload behind.

**How to apply:** First collect the account-owned parent IDs, then delete children with a direct owner predicate or a parent-ID `in` predicate. Keep the parent-ID list scoped to the account being deleted.