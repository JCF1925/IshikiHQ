---
name: Credential revocation lock ordering
description: Preventing an in-flight OAuth refresh from restoring credentials after a linked connection is revoked.
---

Token refresh persistence and connection revocation must lock the same connection row first, then update or scrub the credential row within that transaction.

**Why:** A conditional account update with an `EXISTS` check is not sufficient under PostgreSQL `READ COMMITTED`. Its statement snapshot can see an active connection, block on the credential row while revocation commits, then restore the newly scrubbed credential.

**How to apply:** For any integration where multiple workers share OAuth material, use consistent connection-to-credential lock ordering for refresh, disconnect, revocation, and credential replacement. Prove it with separate database sessions where refresh is already blocked when revocation commits.