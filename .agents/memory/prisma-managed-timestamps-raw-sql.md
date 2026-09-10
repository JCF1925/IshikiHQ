---
name: Prisma managed timestamps in raw SQL
description: Required Prisma-managed timestamps need explicit values when records are inserted outside Prisma Client.
---

Raw SQL inserts into Prisma-owned tables must explicitly supply required fields marked `@updatedAt` unless the committed database migration defines its own default.

**Why:** Prisma Client populates `@updatedAt`, but the PostgreSQL column can remain `NOT NULL` without a database default. A raw insert that omits it therefore fails at runtime even though equivalent Prisma Client writes succeed.

**How to apply:** When adding or reviewing raw SQL writes to Prisma models, compare every required column against the deployed migration SQL rather than assuming Prisma annotations create database-side defaults.