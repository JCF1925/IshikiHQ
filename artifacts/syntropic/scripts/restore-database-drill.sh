#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

fail() {
  printf 'Restore drill failed: %s\n' "$1" >&2
  exit 1
}

[[ -n "${RESTORE_DATABASE_URL:-}" ]] || fail "RESTORE_DATABASE_URL is required"
[[ -n "${BACKUP_FILE:-}" ]] || fail "BACKUP_FILE is required"
[[ -r "$BACKUP_FILE" ]] || fail "BACKUP_FILE is not readable"
[[ "${DATABASE_URL:-}" != "$RESTORE_DATABASE_URL" ]] || fail "the drill target must not be DATABASE_URL"

for command_name in pg_restore psql sha256sum node; do
  command -v "$command_name" >/dev/null 2>&1 || fail "$command_name is not installed"
done

target_name="$(
  RESTORE_DATABASE_URL="$RESTORE_DATABASE_URL" node -e '
    const value = process.env.RESTORE_DATABASE_URL;
    try {
      const url = new URL(value);
      if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") process.exit(2);
      const name = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
      if (!name) process.exit(2);
      process.stdout.write(name);
    } catch {
      process.exit(2);
    }
  '
)" || fail "RESTORE_DATABASE_URL must be a PostgreSQL URL with a database name"

[[ "$target_name" =~ ^[A-Za-z0-9_]+$ ]] ||
  fail "drill target database name must contain only letters, numbers, and underscores"
[[ "$target_name" == *_restore_drill ]] ||
  fail "target database name must end in _restore_drill"
[[ "${RESTORE_DRILL_CONFIRM:-}" == "$target_name" ]] ||
  fail "set RESTORE_DRILL_CONFIRM to the exact target database name"
evidence_file="${RESTORE_DRILL_EVIDENCE_FILE:-${BACKUP_FILE}.restore-drill.json}"
evidence_directory="$(dirname -- "$evidence_file")"
mkdir -p -- "$evidence_directory"
[[ -w "$evidence_directory" ]] || fail "RESTORE_DRILL_EVIDENCE_FILE directory is not writable"
started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
started_epoch="$(date +%s)"

# Parse the URI into libpq environment fields so credentials never appear in
# process arguments and clients cannot mistake the URI for a database name.
restore_database_url="$RESTORE_DATABASE_URL"
unset RESTORE_DATABASE_URL DATABASE_URL
readarray -d '' -t connection_parts < <(
  CONNECTION_URL="$restore_database_url" node - <<'NODE'
const url = new URL(process.env.CONNECTION_URL)
if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') process.exit(2)
const values = [
  decodeURIComponent(url.username),
  decodeURIComponent(url.password),
  url.hostname,
  url.port || '5432',
  decodeURIComponent(url.pathname.replace(/^\/+/, '')),
  url.searchParams.get('sslmode') || 'prefer',
]
if (!values[0] || !values[2] || !values[4]) process.exit(2)
process.stdout.write(`${values.join('\0')}\0`)
NODE
) || fail "RESTORE_DATABASE_URL must be a valid PostgreSQL URL"
[[ "${#connection_parts[@]}" -eq 6 ]] || fail "RESTORE_DATABASE_URL is incomplete"
export PGUSER="${connection_parts[0]}"
export PGPASSWORD="${connection_parts[1]}"
export PGHOST="${connection_parts[2]}"
export PGPORT="${connection_parts[3]}"
export PGDATABASE="${connection_parts[4]}"
export PGSSLMODE="${connection_parts[5]}"
unset restore_database_url connection_parts

checksum_file="${BACKUP_FILE}.sha256"
[[ -r "$checksum_file" ]] || fail "matching .sha256 file is required"
(
  cd -- "$(dirname -- "$BACKUP_FILE")"
  sha256sum --check --status "$(basename -- "$checksum_file")"
) || fail "backup checksum verification failed"

pg_restore --list "$BACKUP_FILE" >/dev/null ||
  fail "backup archive is not readable by pg_restore"

# The explicit confirmation and naming guard above protect production. The
# target is cleaned so the drill proves a complete, repeatable restore.
pg_restore \
  --exit-on-error \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --dbname="$target_name" \
  "$BACKUP_FILE"

# Do not select application rows: successful connectivity and a non-empty
# public schema are sufficient privacy-safe smoke checks for this script.
table_count="$(
  psql \
    --no-psqlrc --tuples-only --no-align --set=ON_ERROR_STOP=1 \
    --command="SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname = 'public';"
)"
[[ "$table_count" =~ ^[[:space:]]*[1-9][0-9]*[[:space:]]*$ ]] ||
  fail "restored public schema contains no tables"
server_version="$(
  psql \
    --no-psqlrc --tuples-only --no-align --set=ON_ERROR_STOP=1 \
    --command="SELECT current_setting('server_version');"
)"
completed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
duration_seconds="$(( $(date +%s) - started_epoch ))"
temporary_evidence="${evidence_file}.partial"
trap 'rm -f -- "${temporary_evidence:-}"' EXIT
(
  EVIDENCE_FILE="$temporary_evidence" \
  STARTED_AT="$started_at" \
  COMPLETED_AT="$completed_at" \
  DURATION_SECONDS="$duration_seconds" \
  BACKUP_BASENAME="$(basename -- "$BACKUP_FILE")" \
  TABLE_COUNT="${table_count//[[:space:]]/}" \
  SERVER_VERSION="${server_version//[[:space:]]/ }" \
  node - <<'NODE'
const fs = require('node:fs')
const evidence = {
  kind: 'syntropic-restore-drill',
  status: 'passed',
  startedAt: process.env.STARTED_AT,
  completedAt: process.env.COMPLETED_AT,
  durationSeconds: Number(process.env.DURATION_SECONDS),
  backupFile: process.env.BACKUP_BASENAME,
  checksumVerified: true,
  archiveReadable: true,
  publicTableCount: Number(process.env.TABLE_COUNT),
  databaseServerVersion: process.env.SERVER_VERSION,
  privacyNote: 'No URLs, row samples, user content, health data, or financial data recorded.',
}
fs.writeFileSync(process.env.EVIDENCE_FILE, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 })
NODE
)
mv -- "$temporary_evidence" "$evidence_file"

printf 'Restore drill completed for target database: %s\n' "$target_name"
printf 'Privacy-safe schema check passed (%s public tables).\n' "${table_count//[[:space:]]/}"
printf 'Privacy-safe evidence written: %s\n' "$evidence_file"