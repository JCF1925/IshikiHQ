# Production hardening acceptance record

Date: 8 September 2026  
Environment: development, production-like non-production database  
Deployment decision: **not requested and not performed**

## Release-gate result

The no-deployment production hardening gate passed. Any production release still
requires an explicit deployment request and owner approval using
`RELEASE_CHECKLIST.md`.

## Security and privacy

- The project threat model covers authentication, authorization, household
  boundaries, sessions, sharing, provider integrations, uploads, mobile sync,
  auditability, export, retention, and destructive actions.
- Generic uploads are private, owner-scoped, size/type/checksum constrained,
  encrypted by the object provider, short-lived, and recorded before signing.
- Account exports omit passwords, sessions, provider credentials, push tokens,
  and binary payloads; export attempts create privacy-safe audit records.
- The exporter uses an explicit portable-model allowlist. A regression test
  plants canary values in settings, calendar/Redbark credentials, bearer-token,
  push-token, session, and storage-path fields and confirms none occur in the
  serialized export.
- Account deletion requires recent authentication and exact typed confirmation,
  blocks unresolved household dependencies, cleans known private objects, and
  records a surviving irreversible account fingerprint instead of identity.
- Settings never return stored integration credentials to the browser.
- Worker logs observed after restart contained allowlisted event names, polling
  configuration, and aggregate counts only. No user identifiers, provider
  payloads, health/financial records, credentials, URLs, or stack traces were
  logged.

## Recovery evidence

- Recovery objectives: 24-hour RPO and 4-hour RTO.
- A fresh custom-format PostgreSQL backup and SHA-256 sidecar were created with
  restrictive file permissions. The connection credential did not appear in
  command arguments or output.
- The backup checksum and archive structure were verified.
- The archive restored successfully into a newly created isolated database
  named with the required `_restore_drill` suffix.
- Privacy-safe verification found 122 public tables and confirmed Prisma
  migration history without selecting application rows.
- The temporary restore database and local backup files were destroyed when the
  drill ended.
- During the drill, a PostgreSQL client compatibility defect was found and
  fixed: connection URLs are now parsed into standard libpq environment fields
  instead of being passed as a literal `PGDATABASE`.

The production control handoff is now fail-closed and executable: production
backup verification requires managed encryption, immutable storage, the
documented retention values, and a daily/quarterly schedule declaration.
Workers deliver privacy-safe worker-exit, repeated-polling, queue-age, and
dead-letter alerts to a configured HTTPS receiver, and restore drills write
privacy-safe mode-0600 evidence. These controls are not evidence that the
production scheduler, storage policy, receiver, or owner have been configured;
the deployment owner must run the production verification and record the
synthetic alert acknowledgement before release approval.

## Accessibility and responsive acceptance

A real-browser pass at 390×844 confirmed:

- Credential sign-in, redirect, session persistence after reload, and populated
  dashboard rendering.
- Accessible names and visible focus for the mobile menu and quick-add control.
- Escape dismisses both surfaces and returns focus to their trigger.
- Mobile Settings navigation closes the drawer and navigates correctly.
- Export and deletion controls are labeled; deletion remains disabled until the
  exact confirmation phrase is entered.
- Global reduced-motion behavior, safe-area spacing, and sufficient final-card
  clearance from fixed controls.
- No horizontal overflow; measured body/document scroll width equaled client
  width.
- The stored Redbark credential remained empty in the browser and its password
  field was contained in a labeled form.

No application console or API request errors occurred in the focused final
check. A transient development HMR WebSocket reconnect was classified as
development tooling rather than an application failure.

## Staging Google sign-in evidence

The release checklist's real Google grant check writes its redacted evidence
directly to the approved access-controlled release evidence store:

```text
/secure/syntropic-release-evidence/<release-id>/google-auth-staging-evidence-attempt-<UTC timestamp>-<random attempt ID>.json
```

The release owner creates the release-specific directory before the staging
run and passes the unsuffixed filename template as
`AUTH_REGRESSION_EVIDENCE_FILE`. For every run, the smoke test adds a UTC
timestamp and random attempt ID, creates the resulting file without
overwriting, writes it with mode 0600 even when the check fails, and prints
only its privacy-safe path. The release owner retains every attempt in that
directory for the same approved retention period as the release record,
records each exact path and pass/fail decision, and links the accepted attempt
with the release ID, reviewer, and commit beside the corresponding checklist
item. This preserves blocked and retried attempts while keeping the decision
traceable without granting reviewers access to Google credentials or user
data. A failed assertion blocks release; no redacted summary is replaced with
browser logs.

The retained JSON is intentionally limited to the UTC timestamp, staging
origin, callback path, destination path, and boolean assertions. It contains no
provider query strings, tokens, account details, page contents, or raw
exceptions.

Before release approval, `test:auth-google:evidence-release` validates the
mode-0600 release record at
`<release-id>/google-auth-staging-release-record.json`. The record contains
only the selected accepted attempt path and every retained attempt path with a
`passed` or `failed` status. The check requires the accepted attempt to be
listed, present in the current release directory, marked `passed`, and backed
by both redacted passing assertions; it also rejects any retained attempt that
is missing from the record. Failure output contains only safe paths, statuses,
and aggregate error counts, never provider URLs, tokens, account details, or
raw browser output.

## Medication stock acceptance evidence

The disposable-schema medication stock gate writes a mode-0600 JSON record beside
the release record:

```text
/secure/syntropic-release-evidence/<release-id>/medication-stock-acceptance-evidence.json
```

The record contains only the pass/fail status, UTC start and completion times,
duration in milliseconds, aggregate test counts, and the checked-out commit SHA
and commit timestamp. It contains no database URL, disposable schema name,
user/test identifiers, test payloads, or raw test output. The record is written
for failed runs as well as passing runs; the command remains nonzero on failure,
so an unsuccessful or missing record blocks release approval. Before release
approval, `pnpm --filter @workspace/syntropic run test:medication-stock:release`
must also pass; it checks that this record is mode 0600, valid and complete,
and tied to the checked-out commit SHA. A missing, failed, malformed, or stale
record therefore cannot satisfy the release gate.

## Performance profile

The highest-impact repeated work was duplicate dashboard fetching from the
dashboard and quick-add surfaces. The client now coalesces in-flight requests,
uses a short bounded cache, invalidates after mutations, and exposes a real
retry state instead of silently rendering empty values. Responsive inspection
also found and resolved fixed-control overlap and narrow-screen overflow.

The production build completed successfully. No unresolved release-blocking
performance issue was observed in the accepted critical journey.

## Final command evidence

The following commands passed against the integrated change:

```text
prisma validate
prisma migrate deploy
prisma db seed
eslint .
tsc --noEmit
tsx --test tests/*.test.ts
next build
```

Lint completed with pre-existing warnings and no errors. The workflow restarted
successfully with both background workers and Next.js ready. The final browser
acceptance passed after correcting the issues found by the first pass.

## Operational decision

This record proves a non-production restore and release gate. It does not prove
that a production backup schedule, immutable retention policy, alert receiver,
or deployment rollback target is configured. Those controls must be confirmed
by their named owners before checking the corresponding production approval
items in `RELEASE_CHECKLIST.md`.
