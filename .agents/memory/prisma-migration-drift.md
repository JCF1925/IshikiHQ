---
name: Prisma migration drift
description: How to handle generated migrations when the database and Prisma schema contain unrelated pending drift.
---

When creating a focused Prisma migration, inspect generated SQL for unrelated tables and indexes before applying or committing it; retain only the requested schema change when the extra objects belong to another feature.

**Why:** `prisma migrate dev --create-only` compared the full schema to the current database and generated unrelated mobile/HealthKit tables alongside the health-claims change.

**How to apply:** Use the generated SQL as a reference, narrow the migration to the assigned feature, regenerate the client, and run `prisma migrate deploy` plus `prisma migrate status` afterward.

Never rewrite an already-applied migration to strengthen a database guard; restore its original checksum and add a forward migration that replaces the guard.

**Why:** Fresh-schema acceptance can pass while existing databases retain the old trigger, and modifying historical SQL also creates Prisma migration checksum drift.

**How to apply:** Test both a fresh migration chain and an upgrade path that starts with the prior guard definition, applies the forward SQL, and verifies the strengthened behavior.