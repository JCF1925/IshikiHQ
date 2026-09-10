#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

fail() {
  printf 'Backup failed: %s\n' "$1" >&2
  exit 1
}

[[ -n "${DATABASE_URL:-}" ]] || fail "DATABASE_URL is required"
[[ -n "${BACKUP_DIR:-}" ]] || fail "BACKUP_DIR must name an encrypted, access-controlled destination"
if [[ "${OPS_ENVIRONMENT:-}" == "production" ]]; then
  [[ "${BACKUP_ENCRYPTION_MODE:-}" == "managed_kms" ]] ||
    fail "production backups require BACKUP_ENCRYPTION_MODE=managed_kms"
  [[ "${BACKUP_IMMUTABLE:-}" == "true" ]] ||
    fail "production backups require BACKUP_IMMUTABLE=true"
fi

for command_name in pg_dump pg_restore sha256sum node; do
  command -v "$command_name" >/dev/null 2>&1 || fail "$command_name is not installed"
done

# Some libpq client builds treat a URI in PGDATABASE as a literal database
# name. Parse it into the standard connection environment instead, keeping the
# password out of process arguments and output.
database_url="$DATABASE_URL"
unset DATABASE_URL
readarray -d '' -t connection_parts < <(
  CONNECTION_URL="$database_url" node - <<'NODE'
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
) || fail "DATABASE_URL must be a valid PostgreSQL URL"
[[ "${#connection_parts[@]}" -eq 6 ]] || fail "DATABASE_URL is incomplete"
export PGUSER="${connection_parts[0]}"
export PGPASSWORD="${connection_parts[1]}"
export PGHOST="${connection_parts[2]}"
export PGPORT="${connection_parts[3]}"
export PGDATABASE="${connection_parts[4]}"
export PGSSLMODE="${connection_parts[5]}"
unset database_url connection_parts

mkdir -p -- "$BACKUP_DIR"
[[ -d "$BACKUP_DIR" && -w "$BACKUP_DIR" ]] || fail "BACKUP_DIR is not writable"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
dump_path="${BACKUP_DIR%/}/syntropic-${timestamp}.dump"
checksum_path="${dump_path}.sha256"
temporary_dump="${dump_path}.partial"
[[ ! -e "$dump_path" && ! -e "$checksum_path" && ! -e "$temporary_dump" ]] ||
  fail "timestamped backup path already exists; retry in one second"
trap 'rm -f -- "${temporary_dump:-}"' EXIT

# PGDATABASE accepts a PostgreSQL URI. Keeping it in the environment prevents
# credentials appearing in command arguments, shell tracing, or normal output.
pg_dump \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-privileges \
  --file="$temporary_dump"

pg_restore --list "$temporary_dump" >/dev/null
mv -- "$temporary_dump" "$dump_path"
(
  cd -- "$(dirname -- "$dump_path")"
  sha256sum -- "$(basename -- "$dump_path")" >"$(basename -- "$checksum_path")"
)

printf 'Backup completed: %s\n' "$dump_path"
printf 'Checksum written: %s\n' "$checksum_path"