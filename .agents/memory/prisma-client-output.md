---
name: Prisma client output
description: The explicit Prisma client output convention that preserves existing package imports in this workspace.
---

In this pnpm workspace, the default Prisma `prisma-client-js` generator writes the current client into the pnpm virtual store. TypeScript should resolve `@prisma/client` through its package entrypoint rather than a package-local `.prisma` path that may be stale.

**Why:** A package-local `.prisma/client` directory can be left behind by an earlier generation strategy; mapping `@prisma/client` there makes new models disappear from typechecking even after a successful current-schema generation.

**How to apply:** Run Prisma generation before checks that depend on generated models, let normal package resolution select the pnpm virtual-store client, and do not add a source-tree or package-local alias unless the generator output and runtime import resolve to the same directory.
