---
name: Database acceptance target identity
description: The disposable database wrapper requires a database-level acceptance target marker.
---

Database acceptance commands must match `DATABASE_ACCEPTANCE_TARGET` to the database-level `syntropic.acceptance_target` marker; an environment variable alone is not sufficient.

**Why:** The guard prevents a disposable or release-validation command from accidentally running against an unclassified shared database.

**How to apply:** Use the guarded wrapper only when the database is provisioned with the matching target identity. For local verification without that marker, use a uniquely named schema and always drop it in a cleanup trap.