# Release gate (no deployment)

Record evidence, reviewer, date, commit, and pass/fail for every item. A failed
or missing item blocks release; this checklist never authorizes deployment.
The latest non-production acceptance evidence is recorded in
`PRODUCTION_HARDENING_REPORT.md`.

## Change and privacy review

- [ ] Scope, threat model, data inventory, dependencies, and migration diff are reviewed.
- [ ] Authorization and household boundaries are tested for every changed endpoint.
- [ ] Sessions, sharing, integrations, uploads, mobile sync, and destructive actions are reviewed.
- [ ] No credentials, provider payloads, financial/health content, or identifiers appear in logs.
- [ ] Retention, legal holds, user deletion implications, and audit behavior are approved.

## Recovery and operations

- [ ] A fresh encrypted backup and checksum were produced with `pnpm run ops:backup`.
- [ ] A restore into an isolated `*_restore_drill` database passed within the 4-hour RTO.
- [ ] Production verification passed with `pnpm run ops:verify-production`; daily
  scheduling, managed encryption, immutable storage, 35-day daily retention,
  and 12-month monthly retention are evidenced.
- [ ] Backup age met the 24-hour RPO; quarterly drill evidence contains no
  private row data and the isolated database was destroyed within 24 hours.
- [ ] Worker retry, interrupted-job recovery, dead letters, privacy-safe
  logging, queue-age, repeated-polling, and worker-exit alerts were exercised.
- [ ] A synthetic alert reached the named owner and was acknowledged within
  the 15-minute target; a quarterly restore drill was acknowledged within the
  4-hour RTO. Evidence uses `docs/OPERATIONS_EVIDENCE_TEMPLATE.md`.
- [ ] The quarterly evidence freshness check passed with
  `pnpm run ops:verify-production`. It has a passing restore evidence date and
  named operational role, plus a passing alert acknowledgement evidence date
  and named operational role. The check warns 14 days before either 90-day
  deadline; missing, failed, future-dated, or overdue evidence blocks release.
- [ ] The daily `pnpm run ops:remind-evidence` scheduler check is configured in
  production and uses the approved HTTPS alert receiver. Reminders reach each
  named operational role within the 14-day window and contain only evidence
  type, due date, status, and operational role.
- [ ] On-call ownership, provider outage handling, credential rotation, rollback, and incident contacts are current.

## Acceptance

From a clean checkout with production-like non-production configuration:

```sh

# Credential-free evidence privacy and wrapper regression (also runs automatically in CI)
pnpm --filter @workspace/syntropic run test:auth-google:wrapper
pnpm --filter @workspace/syntropic run test:auth-google:evidence-wrapper
pnpm --filter @workspace/syntropic run test:medication-stock:wrapper
pnpm --filter @workspace/syntropic run test:database-target:wrapper
export DATABASE_ACCEPTANCE_TARGET=disposable
# Use the approved access-controlled release evidence store for every
# release-scoped acceptance record. Do not put this file in the repository or
# release-scoped acceptance record. Create the release-specific directory
# before running any release gate.
export RELEASE_EVIDENCE_DIR=/secure/syntropic-release-evidence
export RELEASE_ID=release-YYYYMMDD-COMMIT
umask 077
mkdir -p -- "$RELEASE_EVIDENCE_DIR/$RELEASE_ID"

pnpm install --frozen-lockfile
# Generation-only guard; this does not require DATABASE_URL or a database connection.
pnpm --filter @workspace/syntropic run prisma:generate:release
pnpm --filter @workspace/syntropic run prisma:deploy
pnpm --filter @workspace/syntropic run prisma:seed
pnpm --filter @workspace/syntropic run lint
pnpm --filter @workspace/syntropic run typecheck
pnpm --filter @workspace/syntropic run test
pnpm --filter @workspace/syntropic run build

# Credential-free evidence privacy and wrapper regression (also runs automatically in CI)
pnpm --filter @workspace/syntropic run test:auth-google:wrapper
pnpm --filter @workspace/syntropic run test:auth-google:evidence-wrapper
pnpm --filter @workspace/syntropic run test:medication-stock:wrapper
pnpm --filter @workspace/syntropic run test:database-target:wrapper
export DATABASE_ACCEPTANCE_TARGET=disposable
# Disposable-schema medication stock concurrency and retry acceptance
export MEDICATION_STOCK_EVIDENCE_FILE="$RELEASE_EVIDENCE_DIR/$RELEASE_ID/medication-stock-acceptance-evidence.json"
MEDICATION_STOCK_DATABASE_TARGET=disposable \
  pnpm --filter @workspace/syntropic run test:medication-stock:database
# Confirm the accepted record belongs to this checkout before release approval
pnpm --filter @workspace/syntropic run test:medication-stock:release
# Disposable-schema health-claims ownership and atomicity acceptance
pnpm --filter @workspace/syntropic run acceptance:database
# Read-only legacy health-claim ownership check; a nonzero result blocks release
pnpm --filter @workspace/syntropic run ops:check-health-claims

# Real Google grant against the registered non-production callback (manual)
#
# Use the approved access-controlled release evidence store for every
# release-scoped acceptance record. Do not put this file in the repository or
# paste it into chat. Include a UTC timestamp and random attempt ID before
# `.json` so a retry cannot replace an earlier attempt.
export AUTH_REGRESSION_EVIDENCE_FILE="$RELEASE_EVIDENCE_DIR/$RELEASE_ID/google-auth-staging-evidence.json"
export STAGING_ORIGIN=https://staging.example.invalid
export AUTH_REGRESSION_STAGING=1
export AUTH_URL="$STAGING_ORIGIN"
export AUTH_REGRESSION_BASE="$STAGING_ORIGIN"
export CALENDAR_RECOVERY_STAGING=1
export CALENDAR_RECOVERY_STAGING_ENVIRONMENT=NON_PRODUCTION
export CALENDAR_RECOVERY_STAGING_CONNECTION_ID='dedicated-staging-connection-id'
export CALENDAR_RECOVERY_STAGING_LOG_FILE="$RELEASE_EVIDENCE_DIR/$RELEASE_ID/calendar-recovery-staging-server.log"
export CALENDAR_RECOVERY_EVIDENCE_FILE="$RELEASE_EVIDENCE_DIR/$RELEASE_ID/calendar-recovery-staging-evidence.json"
pnpm --filter @workspace/syntropic run test:auth-google:staging

# Confirm the accepted staging attempt is present, passed, and retained with
# every earlier attempt before release approval.
export AUTH_REGRESSION_RELEASE_RECORD_FILE="$RELEASE_EVIDENCE_DIR/$RELEASE_ID/google-auth-staging-release-record.json"
pnpm --filter @workspace/syntropic run test:auth-google:evidence-release

# Credential-dependent local recovery release check
pnpm --filter @workspace/syntropic run test:auth-google:release

# Guarded real Google Calendar acceptance (manual, dedicated non-production grant)
# The connection ID is supplied only from the access-controlled release record;
# never paste it into terminal transcripts, chat, or evidence.
export GOOGLE_CALENDAR_LIVE_ACCEPTANCE=1
export GOOGLE_CALENDAR_LIVE_ACCEPTANCE_ENVIRONMENT=NON_PRODUCTION_DEDICATED
export GOOGLE_CALENDAR_LIVE_ACCEPTANCE_CONNECTION_ID='dedicated-connection-id'
export GOOGLE_CALENDAR_LIVE_ACCEPTANCE_FINGERPRINT='sha256-of-provider-account-id-nul-calendar-id'
export GOOGLE_CALENDAR_LIVE_ACCEPTANCE_EVIDENCE_FILE="$RELEASE_EVIDENCE_DIR/$RELEASE_ID/google-calendar-live-acceptance-$(date -u +%Y%m%dT%H%M%SZ)-attempt.json"
pnpm --filter @workspace/syntropic run test:calendar-google:live
# Exploratory runs may omit revocation and report it as not-run. The final
# acceptance run must revoke the dedicated grant after every other check passes.
# export GOOGLE_CALENDAR_LIVE_ACCEPTANCE_REVOKE=REVOKE

# Browser release gate (creates a disposable migrated and seeded acceptance schema)
pnpm --filter @workspace/syntropic run test:accessibility:acceptance

# iPhone tester handoff (requires the active public Expo preview domain)
pnpm --filter @workspace/syntropic-mobile run check:ios-preview
```

## Native mobile release scope

The accepted physical-iPhone results for app version 1.0.0 are recorded in
[`IOS_REMINDER_ACCEPTANCE_2026-09-10.md`](IOS_REMINDER_ACCEPTANCE_2026-09-10.md).

- [x] The current native release targets iOS only. Android builds are not
  distributed or represented as release-ready at this stage.
- [x] On a physical iPhone, a reminder received while Ishiki is closed uses
  generic lock-screen text by default and shows the medication name only after
  the user explicitly opts in.
- [x] On a physical iPhone, restoring notification permission in system Settings
  restores reminder delivery, and tapping the notification after a cold start
  opens the correct medication schedule.
- [x] Repeated reminder actions on a physical iPhone create exactly one dose
  record.
- [ ] Before any Android release is enabled, complete tracked follow-up #483 on
  a real Android device. Confirm closed-app delivery, generic-by-default
  lock-screen text, explicit name reveal, the Medication reminders notification
  channel, permission recovery, cold-start routing, and exactly one dose record
  after repeated actions. This item does not block an iOS-only release.

For the production operations check, provide the current UTC date and the
privacy-safe evidence fields through the approved configuration manager. These
values are the only freshness record consumed by the check:

```sh
export OPS_EVIDENCE_CHECK_DATE=YYYY-MM-DD
export OPS_RESTORE_EVIDENCE_DATE=YYYY-MM-DD
export OPS_RESTORE_EVIDENCE_STATUS=pass
export OPS_RESTORE_EVIDENCE_ROLE=database-operator
export OPS_ALERT_EVIDENCE_DATE=YYYY-MM-DD
export OPS_ALERT_EVIDENCE_STATUS=pass
export OPS_ALERT_EVIDENCE_ROLE=incident-commander
pnpm --filter @workspace/syntropic run ops:verify-production
```

`OPS_EVIDENCE_CHECK_DATE` may be omitted for the current UTC date. Record only
the dates, pass/fail status, named operational roles, and remediation using
`docs/OPERATIONS_EVIDENCE_TEMPLATE.md`; never copy production URLs,
credentials, provider payloads, or user data into the release record.

The production verification script requires a GNU-compatible `date` utility
with these behaviors: `date -u -d <ISO-date> +%F` for UTC date validation,
`date -u -d <ISO-date> +%s` for UTC epoch conversion, and
`date -u -d '<ISO-date> + 90 days' +%s` for freshness expiry arithmetic.
It performs this capability check before reading the production configuration
and fails closed with an actionable preflight error when the contract is not
available. The script does not contact production services.

- [ ] `test:accessibility:acceptance` applies every committed Prisma migration to a
  disposable schema, runs the non-destructive upsert seed, and leaves the
  configured non-production database untouched. Its
  `test-results/dashboard-release-gate-evidence.json` records the migration
  count, `Event.projectId` presence, seed completion, and both browser paths.
- [ ] Before any iPhone tester session, `pnpm --filter
  @workspace/syntropic-mobile run check:ios-preview` passes against the active
  public Expo endpoint. It must negotiate the iOS Expo manifest and download a
  non-empty JavaScript launch asset. A failure is a launcher/manifest blocker;
  an app crash after a passing check is recorded separately as a JavaScript
  runtime failure.
- [ ] Medication stock concurrency, correction, manual deduction, and retry
  acceptance passed with
  `MEDICATION_STOCK_DATABASE_TARGET=disposable pnpm --filter
  @workspace/syntropic run test:medication-stock:database`.
  The runner requires this explicit target declaration (or the
  `release-validation` target) and independently verifies that PostgreSQL
  reports the same value through the provisioned
  `syntropic.acceptance_target` database-level setting (read from
  `pg_db_role_setting`, not the session setting). A missing setting or a
  `shared-development` setting is rejected before the acceptance schema is
  created, even when the operator supplies an allowed label or connection
  options.
   The credential-free wrapper regression also exercises malformed PostgreSQL
   URLs and rejected database-client connections. Each case exits nonzero with
   a stable actionable error, and its stdout, stderr, and evidence are checked
   for URLs, credentials, hosts, database names, and schema names.
  Provision each dedicated non-production database with
  `ALTER DATABASE <database> SET syntropic.acceptance_target = 'disposable'`
  (or `release-validation` for that release-validation target); never set the
  shared development database to an allowed value. The command must use a
  dedicated non-production PostgreSQL database, create and migrate a unique
  disposable schema, and remove that schema on exit; it
  must never target the shared development database. The command's failure
   output contains only aggregate test results, and a nonzero result blocks
   release. The run writes mode-0600, release-scoped evidence to
   `$RELEASE_EVIDENCE_DIR/$RELEASE_ID/medication-stock-acceptance-evidence.json`
   with pass/fail status, aggregate test counts, duration, and the checked-out
   commit SHA/timestamp. The evidence contains no database URL, schema name,
    user/test identifiers, or test payloads. Interruptions during setup,
    migration, or cleanup also exit nonzero, remove temporary logs, and retain
    only a failed record with aggregate counts, duration, and commit metadata.
    Record its exact path, release ID, reviewer, commit, and pass/fail decision
    with the checklist item; a missing evidence file blocks release.
    Immediately after the acceptance command,
   `pnpm --filter @workspace/syntropic run test:medication-stock:release` must
   pass. It fails for a missing or non-0600 file, failed or malformed evidence,
   incomplete or inconsistent aggregate counts/duration, or an evidence commit
   SHA that differs from the checked-out `HEAD`.
- [ ] Health-claims privacy, ownership, duplicate-source, retry, and atomic
  confirmation acceptance passed with
  `pnpm --filter @workspace/syntropic run acceptance:database`. The command
  generates the Prisma client, applies committed migrations to an isolated
  disposable schema, runs `HEALTH_CLAIM_DATABASE_TESTS=1`, and removes the
   schema after success or failure. `DATABASE_ACCEPTANCE_TARGET` must be
   explicitly set to `disposable` (or `release-validation` for a dedicated
   release-validation database); the runner reads the matching
   `syntropic.acceptance_target` database-level setting from PostgreSQL catalog
   metadata before creating the schema. A missing, shared-development, or
   mismatched setting blocks the run. A nonzero result blocks release.
- [ ] Every disposable-schema acceptance runner uses the same independent
   target check: `test:price-watch:database`,
   `test:mobile-api:database`, and `test:accessibility:acceptance` require
   `DATABASE_ACCEPTANCE_TARGET` and verify the database-level
   `syntropic.acceptance_target` before schema creation. The standalone mobile
   runner also verifies `MOBILE_API_ACCEPTANCE_DATABASE_URL` when supplied,
   because that URL is the actual schema target. The target wrapper regression
   passes before release approval.
- [ ] Pull requests that touch Syntropic code pass the credential-free CI job.
  The workflow runs these commands as separate, clearly named steps and streams
  their full output in the job log:
  `pnpm --filter @workspace/syntropic run lint`,
  `pnpm --filter @workspace/syntropic run typecheck`,
  `pnpm --filter @workspace/syntropic run test`, and
  `pnpm --filter @workspace/syntropic run build`. Database-backed acceptance,
  staging OAuth, live Google Calendar, and other credential-dependent checks
  remain manual release gates; database CI jobs run only by workflow dispatch.
- [ ] `pnpm --filter @workspace/syntropic run ops:check-health-claims` reports
  zero `HealthClaimImportRow` records whose `userId` differs from the referenced
  import owner. This is a read-only check; a failure blocks release. Its output
  contains only aggregate counts and never claim payloads, source metadata, or
  user identifiers.
- [ ] The credential-free Google evidence privacy and wrapper regression passes in the Syntropic CI
  workflow. CI keeps this check separate from the credential-dependent
  `test:auth-google:release` and staging OAuth checks. The wrapper command output
  is streamed in the failing step and uploaded as the `google-auth-wrapper-logs`
  artifact for diagnosis. The evidence-release wrapper also exercises the
  release-record verifier with passing, failed, missing, and out-of-directory
  fixtures. These checks exercise the real evidence writer and release verifier,
  blocking unexpected keys, provider query strings, account details, tokens, and
  raw exceptions.
- [ ] Google OAuth recovery passed with `AUTH_URL` set to the exact public HTTPS
  origin registered with Google. The release command starts the built Syntropic
  server on an OS-assigned available local port when `AUTH_REGRESSION_BASE` is
  unset; set `AUTH_REGRESSION_PORT` to request a fixed local port for debugging,
  or set `AUTH_REGRESSION_BASE` to target a known server instead. Missing
  Google credentials, an invalid public callback origin, an unavailable server,
  or a failed recovery assertion blocks release.
- [ ] Guarded real Google Calendar acceptance passed against exactly one
  pre-existing dedicated active Google connection with exactly one enabled
  Calendar sync setting. Run `test:calendar-google:live` only in
  non-production with `GOOGLE_CALENDAR_LIVE_ACCEPTANCE=1`,
  `GOOGLE_CALENDAR_LIVE_ACCEPTANCE_ENVIRONMENT=NON_PRODUCTION_DEDICATED`, the
  dedicated account's sole accessible calendar selected, and the approved SHA-256
  fingerprint of its provider-account/calendar identity supplied from the
  access-controlled release record. It creates and deletes only synthetic
  private no-guest events, verifies their identity in provider listings,
  confirms deletion by fetching each removed event, and checks live create/get/update/delete,
  recurrence, Australia/Melbourne timed events, all-day dates, ETag conflict,
  and cursor/list behavior. The wrapper also runs deterministic provider and
  privacy checks; the disposable database acceptance gate remains authoritative
  for worker retry/dead-letter, consent, invitations, private travel, and
  offline fallback. Every run requires
  `GOOGLE_CALENDAR_LIVE_ACCEPTANCE_EVIDENCE_FILE` to name a new absolute path in
  the approved release evidence directory. The wrapper refuses to overwrite an
  existing path and atomically creates a mode-0600 JSON report containing only
  pass/fail, timestamps, check booleans, aggregate counts, revocation state, and
  diagnostic categories. Failed guard, deterministic-test, live-provider, and
  cleanup runs preserve the same safe report without raw errors, provider
  output, tokens, identifiers, or Calendar content. Record the exact evidence
  path, release ID, reviewer, commit, and pass/fail decision. Do
  not set `GOOGLE_CALENDAR_LIVE_ACCEPTANCE_REVOKE=REVOKE` for exploratory runs;
  the final release run must set it and show both `revoke` and `disconnect` as
  true after every other check passes.
- [ ] A real Google sign-in passed against the registered non-production HTTPS
  callback. Run `test:auth-google:staging` only from the staging environment,
  with `AUTH_URL` and `AUTH_REGRESSION_BASE` set to the same public staging
  origin and `AUTH_REGRESSION_STAGING=1` as an explicit safety guard. The
  command opens a fresh browser; complete sign-in with the designated
  non-production Google account, approve the requested grant, and confirm the
  browser returns to `/` with the Syntropic Dashboard visible. Do not enter
  credentials in the terminal or chat. Before running it, create the
  release-specific directory in the approved access-controlled release
  evidence store at
  `/secure/syntropic-release-evidence/<release-id>/`, and set
  `AUTH_REGRESSION_EVIDENCE_FILE` to
  `/secure/syntropic-release-evidence/<release-id>/google-auth-staging-evidence.json`.
   Treat that value as a filename template: every run appends
   `-attempt-<UTC timestamp>-<random attempt ID>` before `.json`, creates the
   resulting file without overwriting an existing file, and prints only that
   privacy-safe path for the reviewer. Each attempt file has mode 0600. Its
   only fields are the UTC
  timestamp, staging origin, callback path, destination path, and boolean
  assertions (`callbackObserved` and `returnedToDestinationPath`); it never
  contains provider query strings, tokens, account details, or raw errors.
   Retain every attempt file in that release directory for the same approved
   retention period as the release record. Record every attempt's exact path
   and pass/fail decision, and explicitly link the accepted attempt together
   with the release ID, reviewer, and commit. Record each attempt's SHA-256
   content digest as part of the release record. A failed assertion blocks release;
   never delete or replace an earlier redacted summary, and never substitute
   browser logs or a copied provider URL.
- [ ] Generate and validate the accepted staging sign-in evidence record before
   release approval. The authoring command enumerates every retained attempt,
   derives only `passed` or `failed` from its redacted assertions, and requires
   the reviewer to select the accepted path explicitly:
   ```sh
   export AUTH_REGRESSION_ACCEPTED_ATTEMPT_PATH="$RELEASE_EVIDENCE_DIR/$RELEASE_ID/google-auth-staging-evidence-attempt-<UTC timestamp>-<random attempt ID>.json"
   pnpm --filter @workspace/syntropic run write:auth-google:evidence-release -- \
     "$AUTH_REGRESSION_ACCEPTED_ATTEMPT_PATH"
   ```
   It atomically writes
   `$RELEASE_EVIDENCE_DIR/$RELEASE_ID/google-auth-staging-release-record.json`
   as a mode-0600 JSON file with only `schemaVersion: 2`,
   `acceptedAttemptPath`, `acceptedAttemptSha256`, and an `attempts` list of
   `{path,status,sha256}` entries. Compute each SHA-256 over the exact retained
   file bytes before review.
   The command reads no credentials or provider output. The follow-up
   `test:auth-google:evidence-release` check confirms every listed file is
   still mode 0600 in the current release directory, validates the redacted
   callback and dashboard assertions, and rejects a missing, failed,
   duplicated, or out-of-directory accepted attempt. It also rejects changed
   evidence, mode changes, duplicate content under another path, or mismatched
   approved metadata. Both commands output only safe paths, statuses, and
   aggregate counts; they never print provider URLs, tokens, account details,
   evidence contents, or browser output.
- [ ] Authentication, private workspace, household isolation, calendar,
  commitments, money, health, study/work, and sign-out journeys pass.
- [ ] Keyboard order, visible focus, labels, error association, contrast,
  reduced motion, zoom, and responsive mobile web acceptance pass.
- [ ] `pnpm --filter @workspace/syntropic run test:accessibility:acceptance` passes
  with no serious or critical axe violations in dark and light themes, covering
  sign-in, dashboard errors, mobile navigation, quick add, Settings, 320px,
  390px, and 200% zoom.
- [ ] Performance profile has no unresolved release-blocking bottleneck.
- [ ] Supported browsers and mobile sync/offline recovery acceptance pass.
## Decision

- [ ] Release notes and user guide reflect behavior, limitations, support, privacy, and recovery.
- [ ] Previous artifact and pre-migration backup are available and the rollback is rehearsed.
- [ ] Security, privacy, accessibility, operations, and product owners approve.
- [ ] An explicit, separate deployment authorization has been received.
