# Operations and recovery runbook

## Ownership and objectives

The incident commander owns recovery decisions; the database operator performs
backup/restore; the application owner validates migrations and critical
journeys; the privacy owner assesses notification obligations. Record every
decision and timestamp in the incident record, never in application logs.

- **Recovery point objective (RPO):** 24 hours. Take at least one encrypted
  logical backup daily and before every production migration.
- **Recovery time objective (RTO):** 4 hours from incident declaration.
- Run a restore drill at least quarterly and before the first production
  release. A backup is not proven until restored into an isolated database.

## Production scheduling and immutable storage

Production scheduling and the alert receiver are deployment-owner controls.
They must be configured in the production environment before the release
checklist can be approved; this runbook does not authorize deployment.

The production environment must provide the following values through its
secret/configuration manager. Do not commit them or place receiver URLs in
logs:

```text
OPS_ENVIRONMENT=production
BACKUP_DIR=/mounted/immutable-backup-destination
BACKUP_ENCRYPTION_MODE=managed_kms
BACKUP_IMMUTABLE=true
BACKUP_DAILY_RETENTION_DAYS=35
BACKUP_MONTHLY_RETENTION_MONTHS=12
BACKUP_SCHEDULE=0 2 * * *
OPS_RESTORE_DRILL_SCHEDULE=quarterly
OPS_EVIDENCE_REMINDER_SCHEDULE=daily
OPS_ALERT_WEBHOOK_URL=https://<approved-alert-receiver>
OPS_ALERT_OWNER=<named-on-call-owner>
OPS_ALERT_ENVIRONMENT=production
OPS_ALERT_POLL_FAILURE_THRESHOLD=3
OPS_ALERT_QUEUE_AGE_SECONDS=300
OPS_ALERT_ACK_WINDOW_MINUTES=15
```

Run `pnpm run ops:verify-production` from the production worker release
using those values. Configure the platform scheduler to run
`pnpm run ops:backup` once daily and before every production migration. The
same scheduler must run `pnpm run ops:remind-evidence` once daily with the
production evidence dates, pass/fail statuses, and named operational roles
configured below. It sends one reminder for each passing evidence record within
14 days of its 90-day deadline through the approved HTTPS receiver, but only
on the 14-day, 7-day, and 1-day calendar marks before that deadline. Runs on
the other days do not send that evidence reminder, so a daily scheduler cannot
deliver the same deadline reminder every day. A newly recorded evidence date
derives a new deadline and starts the cadence again; no send history or
receiver/user data is persisted for deduplication. The
reminder's evidence details contain only the evidence type, due date, status,
and named operational role; the scheduler must not add a URL, credential,
provider payload, or user data. A receiver delivery failure or an invalid,
missing, failed, future-dated, or overdue evidence record is nonzero and must
be investigated before release. The
destination must use managed encryption keys, object lock/immutable versions,
and the retention policy above: daily objects for 35 days and one monthly
object for 12 months. Legal or incident holds override deletion and must have
an owner and review date.

## Legacy health-claim ownership check

Before a release, run the read-only integrity check against the same migrated
database that will be used for release validation:

```sh
pnpm run ops:check-health-claims
```

The check joins `HealthClaimImportRow` to its `HealthClaimImport` and counts
rows whose `userId` differs from the import owner's `userId`. A pass reports
zero mismatched rows. A failure reports the mismatched row and import counts,
exits nonzero, and blocks release until the database operator investigates and
remediates the ownership issue through a reviewed procedure. The command never
updates records and never selects or prints claim payloads, source metadata, or
user identifiers. Record only the pass/fail result and aggregate counts in
release evidence; do not copy health data into logs or tickets.

The generic HTTPS receiver receives only the alert type, worker name,
allowlisted aggregate fields, named owner, and timestamps. It is responsible
for paging the owner and recording acknowledgement. The application never
sends database URLs, job/user IDs, provider payloads, credentials, or row
content.

The scheduled evidence reminder uses the same receiver and named
`OPS_ALERT_OWNER`. Its allowlisted evidence details are exactly
`evidenceType`, `dueDate`, `status`, and `operationalRole`; the two evidence
roles are configured through `OPS_RESTORE_EVIDENCE_ROLE` and
`OPS_ALERT_EVIDENCE_ROLE`. Run the reminder from the platform scheduler, not
from a user request or application route.

## Development feedback spreadsheet recovery

The feedback flow now serializes first-time spreadsheet creation, but sheets
created by simultaneous submissions before that fix may still exist. The
spreadsheet shown as **authoritative** in the development feedback dialog is
the current source of truth for that feedback owner:

1. Open the feedback dialog and follow **Open authoritative**. If the sheet has
   not been initialized yet, submit one report first; the first successful
   submission creates and persists it.
2. Follow **Search Drive for likely older sheets** and search for the exact
   title `Ishiki Development Improvements`. A likely orphan has that title and
   an `Improvements` worksheet, but the title alone is not proof that it is
   safe to discard.
3. Paste each candidate's spreadsheet URL or ID into **Compare an older sheet**
   in the feedback dialog. Review the read-only counts and candidate-only and
   authoritative-only rows instead of comparing rows manually. Preserve every
   row: if recovery is needed, record which candidate it came from before
   copying anything into the authoritative sheet.
4. If the candidate has unique rows, use **Review consolidation** and confirm
   that separate action. Cleanup is blocked until a fresh comparison shows no
   candidate-only rows.
5. Once recovery is complete, the owner can separately confirm keeping,
   archiving, or deleting the candidate. Archiving prefixes its spreadsheet
   title with `[Archived]` and keeps its evidence. Deleting clears only the
   candidate `Improvements` rows; the header and authoritative rows remain.
   Every result names the affected candidate, and the authoritative sheet
   cannot be selected as a cleanup target.

The recovery view is read-only: it never lists or mutates Google Drive files,
and it never performs a merge or cleanup without a separate owner confirmation.

## Backup procedure

Prerequisites are PostgreSQL client tools matching the server major version, an
encrypted access-controlled destination, and `DATABASE_URL` supplied through
the secret manager. Do not enable shell tracing.

```sh
BACKUP_DIR=/secure/syntropic-backups pnpm run ops:backup
```

The command creates a custom-format dump and SHA-256 sidecar with mode governed
by `umask 077`. Upload both to immutable encrypted storage. Restrict access to
the recovery role. The script places the connection URL only in a child-process
environment and never prints it.

In production, the script fails closed unless managed encryption and immutable
storage are explicitly declared. The scheduler and destination policy are
verified with `pnpm run ops:verify-production`; a successful local backup
alone is not evidence that the production schedule or retention policy exists.

## Restore drill

Provision a temporary, isolated empty PostgreSQL database whose name ends in
`_restore_drill`. It must not accept application traffic. Supply its URL and an
exact confirmation separately:

```sh
BACKUP_FILE=/secure/syntropic-backups/syntropic-YYYYMMDDTHHMMSSZ.dump \
RESTORE_DATABASE_URL='postgresql://…/syntropic_restore_drill' \
RESTORE_DRILL_CONFIRM=syntropic_restore_drill \
pnpm run ops:restore-drill
```

The script rejects the live `DATABASE_URL`, verifies the checksum, cleans only
the explicitly confirmed drill target, restores with ownership/ACLs omitted,
and performs a schema-only smoke check. Afterwards run migrations in status
mode and the release acceptance checks against the isolated target. The script
writes a mode-0600 JSON evidence file next to the backup unless
`RESTORE_DRILL_EVIDENCE_FILE` names an approved evidence destination. Record
start/end times, backup timestamp, PostgreSQL versions, checks passed, and
remediation; do not record URLs, row samples, health data, or financial data.
Use `docs/OPERATIONS_EVIDENCE_TEMPLATE.md` for the owner acknowledgement.
Destroy the temporary database after evidence is approved.

### Medication stock acceptance target identity

The medication stock acceptance runner does not trust its operator-provided
target label by itself. Each dedicated non-production PostgreSQL database used
by the runner must have independently provisioned target metadata:

```sql
ALTER DATABASE <database>
  SET syntropic.acceptance_target = 'disposable';
```

Use `release-validation` instead of `disposable` only for a database dedicated
to that release-validation purpose. The runner reads this safe database setting
and requires it to exactly match `MEDICATION_STOCK_DATABASE_TARGET` before it
creates an acceptance schema. It reads the database-level catalog setting
rather than the session setting, so connection options cannot override the
provisioned identity. A missing setting, an unset setting, or a
`shared-development` setting therefore fails closed even if an allowed label is
provided. Do not assign an allowed value to the shared development database.

The runner's rejection and failure diagnostics are aggregate only. Do not add
database URLs, usernames, hostnames, database names, schema names, or target
metadata values to logs or release evidence.

### Other disposable acceptance target identity

All other acceptance runners that create a disposable schema use the same
independent target contract. Before running
`acceptance:database`, `test:price-watch:database`,
`test:mobile-api:database`, or `test:accessibility:acceptance`, set an explicit
operator mode:

```sh
export DATABASE_ACCEPTANCE_TARGET=disposable
```

The dedicated PostgreSQL database must be provisioned once by the database
operator, not by the acceptance command:

```sql
ALTER DATABASE <database>
  SET syntropic.acceptance_target = 'disposable';
```

Use `release-validation` only for a database dedicated to that purpose. The
shared development database must remain `shared-development` or unset. The
acceptance runners read the database-level catalog setting from
`pg_db_role_setting`, rather than the session setting, and fail before
creating a schema when the setting is missing, shared, or does not match the
explicit mode. Connection options therefore cannot make a shared database
appear to be an approved target. The standalone mobile runner repeats the
check against `MOBILE_API_ACCEPTANCE_DATABASE_URL` when that optional URL is
provided, because it is the actual database target for that invocation.

The dashboard release gate applies the same check before installing its
temporary schema. The legacy health-claim ownership command is read-only and
does not create a schema or mutate rows; its safe procedure is to run it with
the same already-verified migrated `DATABASE_URL` used by the disposable
acceptance run. The rejection and failure output from every runner is
aggregate only; never record URLs, database names, schema names, or target
metadata values.

Restore drills use a separate safe identity check because they intentionally
operate on a restored, empty database rather than an acceptance schema. The
restore script rejects the live `DATABASE_URL`, parses and validates the
provided database name, requires an `_restore_drill` suffix and an exact
`RESTORE_DRILL_CONFIRM` match, and records no connection identity in evidence.
Do not use the restore-drill naming confirmation as a substitute for
`syntropic.acceptance_target` on acceptance databases.

## Disaster recovery

1. Declare the incident, freeze writes and releases, preserve audit evidence,
   and revoke suspected credentials.
2. Determine the last known-good backup and migration. Compare its timestamp
   with the RPO; disclose an RPO breach to the incident commander immediately.
3. Provision an isolated replacement database and restore using the drill
   procedure. Apply only reviewed committed migrations.
4. Validate authentication, household isolation, calendar/financial provider
   disconnection behavior, one private record per critical module, and worker
   queues. Use synthetic operator-owned records only.
5. Rotate database, session, OAuth, storage, and provider credentials if their
   confidentiality might be affected.
6. Put workers in service before web traffic only after checking stale running
   jobs. Observe retry/dead-letter counts; never replay a dead letter blindly.
7. Switch traffic through the platform control plane, monitor, and retain the
   old environment read-only until the rollback window closes.

## Retention and disposal

- Daily backups: 35 days; monthly backups: 12 months. Legal or incident holds
  override scheduled deletion and must have an owner and review date.
- Drill databases: destroy within 24 hours. Local temporary copies: delete
  immediately after upload/verification.
- Operational logs: 30 days unless an incident hold applies. Log only event
  names, counts, durations, safe error categories, and coarse timestamps.
- Audit records and user records follow the approved product/legal retention
  schedule. Backups expire on schedule; deletion propagates as each encrypted
  backup expires. Never edit historical dumps in place.
- Disposal means deleting objects and versions, expiring encryption keys where
  applicable, and recording object identifiers and completion time without
  recording user content.

Review these periods with privacy/legal owners before release and whenever the
data inventory or jurisdiction changes.

## Worker operations

Workers use durable compare-and-set claims, bounded exponential retry, and
terminal `dead_letter` states. Logs are structured JSON and may contain only:
worker/event names, configured interval/batch size, aggregate status counts,
and allowlisted error categories/codes. Never log job/user/connection IDs,
provider payloads, record titles, cursors, tokens, URLs, headers, stack traces,
or raw exception messages.

Alert when a worker exits, polling fails three consecutive times, oldest
due-job age exceeds five minutes, or any new dead letter appears. These
conditions are delivered to the configured named owner through the HTTPS
receiver. Delivery failures are themselves emitted as a safe `alerting`
worker event and must be investigated immediately. Run
`pnpm run ops:alert-test` after receiver configuration; the owner must
acknowledge the synthetic notification within the 15-minute target and record
the result in the evidence template.

Triage in the protected database, check consent and provider health, fix the
cause, then requeue through a reviewed idempotent administrative procedure.
Preserve attempt count and an audit note; never mutate provider data manually.

## Rollback

Stop traffic and workers. Prefer application rollback to the previous immutable
artifact when its schema is backward-compatible. Prisma migrations are
forward-only: do not run `migrate reset`, `migrate dev`, or ad-hoc down SQL in
production. For an incompatible/destructive migration, freeze writes, restore
the pre-migration backup to a new database, run the previous artifact against
that database in isolation, validate critical journeys, then switch traffic.
Reconcile post-backup writes explicitly and with privacy-owner approval.

Rollback triggers include household-boundary or authorization failure,
corruption, migration failure, sustained critical error rate, secret exposure,
or inability to meet the RTO. The incident commander approves rollback and
later approves resumption.