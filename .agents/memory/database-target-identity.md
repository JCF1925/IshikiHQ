---
name: Database target identity
description: How acceptance runners must distinguish dedicated databases from shared development targets.
---

Acceptance target labels must be matched against database-level provisioned
metadata, not a session setting or operator-provided value alone.

**Why:** PostgreSQL session settings can be supplied or overridden through
connection options, allowing a shared development database to appear to have
an approved acceptance label.

**How to apply:** Provision an approved target class at the database level and
read that catalog-backed value before creating any acceptance schema. Run
acceptance against a dedicated disposable database; never mark the shared
development database as approved. Keep mismatch diagnostics aggregate and
avoid emitting connection or identity data.