---
name: Post-merge database safety
description: Why unattended post-merge reconciliation must not run schema-diff pushes in this mixed Prisma and Drizzle workspace.
---

Keep automatic post-merge reconciliation dependency-only. Database changes must be represented by explicit, reviewed, committed migrations rather than an unattended Drizzle schema push.

**Why:** The shared Drizzle schema maps some Prisma-owned tables. Drizzle's push command can require schema-conflict prompts even with force enabled, while post-merge runs without a TTY; it may also emit a failure stack trace while returning success.

**How to apply:** When a task changes database structure, add the appropriate migration to the owning system and invoke that deterministic migration explicitly. Do not restore a generic schema-diff push to the post-merge script.