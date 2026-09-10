---
name: psql command variables
description: Safe parameter handling for PostgreSQL acceptance shell scripts that execute SQL with psql.
---

Do not rely on psql colon-variable interpolation inside SQL passed with `-c`; this environment sends those references to PostgreSQL unchanged.

**Why:** A database-backed cancellation harness failed because PostgreSQL received `:'variable'` literally from a `psql -c` query.

**How to apply:** Use a stdin SQL script when psql variables are needed. For generated identifiers that contain only values already constrained by a strict allowlist, validate them first and then use the validated literal.