# Database acceptance trend records

The release workflow publishes one small trend record for each disposable
database acceptance job on every run. The records are uploaded as GitHub
Actions artifacts named `database-acceptance-trend-*`, so release maintainers
can count `category` values across workflow runs and compare recurring
connection, migration, seed, test, and ownership-check failures over time.

## Privacy contract

Each record is a single JSON object containing only:

- `category`: one of `connection`, `migration`, `seed`, `test`,
  `ownership-check`, or `none`;
- `status`: `failed` or `passed`;
- `exit_code`: the numeric acceptance process exit code;
- `workflow`, `run_id`, `run_attempt`, and `event`: GitHub workflow/run
  metadata;
- `recorded_at`: the UTC timestamp when the record was written.

The acceptance command output, database URL, schema name, fixture values,
health data, user data, and error text are never copied into a trend record.
The detailed failure evidence artifact remains a separate sanitized artifact.

## Retention and access

Trend artifacts use a 90-day retention period. GitHub Actions applies the
repository's normal artifact access rules; only release maintainers who can
read Actions artifacts in the repository should review them. The workflow
token has `contents: read` only and does not grant write access to repository
contents or any database.

To review a period, download the `database-acceptance-trend-*` artifacts from
the repository's Actions run list and count the `category` field by
`recorded_at` date. Keep the downloaded records in the same access-controlled
release-review location as other release evidence and remove local copies
when that review period ends. Do not replace trend records with command logs
or add fixture/user data to make a failure easier to diagnose.

The 90-day window is intentionally shorter than product and operational
evidence retention: this dataset is for recurring CI reliability signals, not
for health, user, or audit history.