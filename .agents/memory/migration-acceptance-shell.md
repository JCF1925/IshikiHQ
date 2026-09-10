---
name: Migration acceptance shell
description: Shell and psql constraints for disposable Prisma migration acceptance fixtures.
---

Disposable migration scripts must invoke Prisma through the workspace package runner when the command is wrapped by `env`; direct `prisma` is not guaranteed to be on PATH. Acceptance harnesses that need to intercept package commands must wrap `pnpm`, because pnpm prepends package-local binaries before invoking scripts. Generated fixture identifiers can be interpolated into a shell-expanded SQL heredoc, but psql `:variables` are not expanded inside dollar-quoted PL/pgSQL bodies.

**Why:** The acceptance wrapper runs outside a package-script PATH, package-local binary precedence can bypass a direct Prisma shim, and the migration assertions need generated schema-scoped IDs inside `DO` blocks. These issues otherwise fail before the behavior under test is reached.

**How to apply:** Use `env DATABASE_URL=... pnpm exec prisma ...` for migration/seed commands. Keep externally generated fixture values constrained to a safe identifier format before shell expansion, and use quoted heredocs with psql variables for ordinary SQL.