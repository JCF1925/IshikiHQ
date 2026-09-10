# Production operations evidence

Use one copy for each daily backup review, quarterly restore drill, and alert
test. Store completed evidence in the approved access-controlled operations
location. Never include database URLs, credentials, row samples, user/job
identifiers, health or financial data, provider payloads, or raw exceptions.

## Restore drill

- Environment:
- Drill date (UTC):
- Incident/release reference:
- Reviewer:
- Backup timestamp and checksum result:
- Isolated target confirmation (record only that the `_restore_drill` naming
  guard passed):
- Start time (UTC):
- End time (UTC):
- Duration:
- PostgreSQL major version:
- Schema-only smoke check:
- Evidence JSON path:
- Temporary database destroyed within 24 hours:
- Remediation:
- Reviewer acknowledgement time (UTC):

Pass criteria: checksum and archive validation pass, restore completes within
the 4-hour RTO, privacy-safe evidence is written, and the temporary database
is destroyed after approval.

## Alert receiver synthetic test

- Environment:
- Test date (UTC):
- Named owner:
- Receiver configuration verification result:
- Synthetic alert sent at (UTC):
- Alert type observed:
- Acknowledged at (UTC):
- Response time in minutes:
- Within the 15-minute target:
- Remediation:
- Reviewer acknowledgement:

Pass criteria: the configured receiver delivers the synthetic alert to the
named owner and acknowledgement is recorded within 15 minutes.

## Quarterly evidence freshness

Record this small freshness record with the release evidence. It is deliberately
limited to dates, pass/fail status, and named operational roles. Do not add
receiver URLs, credentials, provider payloads, user data, or evidence contents.

- Evidence check date (UTC):
- Quarterly restore evidence date (UTC):
- Quarterly restore evidence status (pass/fail):
- Quarterly restore operational role:
- Alert acknowledgement evidence date (UTC):
- Alert acknowledgement evidence status (pass/fail):
- Alert acknowledgement operational role:
- Freshness check result (pass/fail):
- Remediation:

The release check warns when either record is within 14 days of its 90-day
quarterly deadline. Missing, failed, future-dated, or overdue evidence is a
failed release check and must be remediated before release approval.

The production scheduler runs `pnpm run ops:remind-evidence` daily with the
same four evidence values. When a passing record is within 14 days of its
deadline, the approved alert receiver sends the named operational role a
reminder. Record only the evidence type, due date, status, operational role,
and delivery result; never copy the receiver URL, credentials, provider
payload, user data, or evidence contents into this record.

Release validation must run the daily command against a receiver harness with
both records inside the warning window. The harness must observe exactly one
privacy-safe reminder for the restore role and one for the alert
acknowledgement role. Missing, failed, future-dated, and overdue records must
make the command exit nonzero before any reminder is delivered.

## Daily backup and retention review

- Review date (UTC):
- Reviewer:
- Latest backup age:
- Checksum result:
- Encryption policy:
- Immutable/versioned storage policy:
- Daily retention: 35 days:
- Monthly retention: 12 months:
- Legal/incident hold review:
- Scheduler result:
- Remediation: