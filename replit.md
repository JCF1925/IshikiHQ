# Ishiki

A private, Australian-first personal operating system for money, health, commitments, goals, events, study, work, and future household coordination.

## Run & Operate

- `pnpm --filter @workspace/syntropic run dev` — run the Ishiki Next.js app
- `pnpm --filter @workspace/syntropic run prisma:deploy` — apply committed Prisma migrations
- `pnpm --filter @workspace/syntropic run test` — run deterministic domain tests
- `pnpm --filter @workspace/syntropic run lint` — lint the imported application
- `pnpm --filter @workspace/syntropic run typecheck` — strict TypeScript check
- `pnpm --filter @workspace/syntropic run build` — production build
- `pnpm --filter @workspace/syntropic run ops:backup` — encrypted-destination PostgreSQL backup
- `pnpm --filter @workspace/syntropic run ops:restore-drill` — guarded isolated restore drill
- `pnpm task-priority:ingest -- <export.json>` — atomically ingest a complete project-task service export
- `pnpm task-priority:refresh` — regenerate the versioned priority register from the committed snapshot
- `pnpm task-priority:check` — verify task coverage, release dependencies, and generated priority output
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- Required names are documented in `artifacts/syntropic/.env.example`; secrets must only be stored in Replit Secrets.
- Production hardening evidence is in `artifacts/syntropic/docs/PRODUCTION_HARDENING_REPORT.md`; it never authorizes deployment.

## Stack

- Next.js 16, React 19, TypeScript, Tailwind
- PostgreSQL + Prisma
- NextAuth with credential and optional Google OAuth providers
- Zod request validation and standard API error envelopes

## Where things live

- App: `artifacts/syntropic`
- Database source of truth: `artifacts/syntropic/prisma/schema.prisma`
- Fresh-database migration: `artifacts/syntropic/prisma/migrations`
- Calendar provider boundary: `artifacts/syntropic/lib/calendar-provider.ts`
- Financial invariants: `artifacts/syntropic/lib/financial-truth.ts`

## Architecture decisions

- Manual-first, private-by-default, Australian-first, and auditable.
- Calendar integrations use a provider adapter; Google is first.
- Health, tax/HELP, and integration credentials/settings are never household-shareable.
- A user retains a private workspace and may later belong to multiple households.
- Transaction status is pending → confirmed → locked; unlocks require a reason and audit record.

## Product

M0 safe baseline and M1 Calendar are implemented. Household sharing is M2; Study and Work ship together after that; banking, mobile, Apple Health, and pathology OCR remain later roadmap milestones.

In development, authenticated testers can submit structured improvements from any app page to the shared private Google Sheets queue. The UI and API are disabled outside development.

The current ranked delivery plan is generated at `TASK_PRIORITY.md`, with focused release checklists in `task-priority/briefs/`. Project-task change events should feed a complete state-partitioned export to `pnpm task-priority:ingest`; new tasks remain untriaged until a maintainer confirms their priority, size, and release.

## User preferences

- Do not deploy or expose secrets without an explicit request.
- Event cost is Ishiki-only and never affects invitation rules.
- Medical events are private by default; full forwarding requires explicit per-event opt-in.
- Home Assistant is out of scope.

## Gotchas

- Re-run Prisma generate after schema changes.
- Keep provider credentials server-side and exclude them from exports and API responses.
- The Next.js artifact owns `/api`; the legacy shared API artifact is routed at `/_workspace-api`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- Operations, recovery, retention, rollback, user guidance, and the no-deploy release gate are in `artifacts/syntropic/docs`.
