#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
started_ms="$(date +%s%3N)"
test_log="$(mktemp "${TMPDIR:-/tmp}/syntropic-medication-stock.XXXXXX.log")"
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
schema=""
schema_created=0
failure_category="connection"
test_total=0
test_passed=0
test_failed=0
test_skipped=0
test_todo=0
test_status=0
commit_sha="$(git rev-parse --verify HEAD 2>/dev/null || true)"
commit_timestamp="$(git show -s --format=%cI HEAD 2>/dev/null || true)"
evidence_file="$PWD/test-results/medication-stock-acceptance-evidence.json"
database_acceptance_evidence_file="${DATABASE_ACCEPTANCE_EVIDENCE_FILE:-}"

if [[ -n "${MEDICATION_STOCK_EVIDENCE_FILE:-}" ]]; then
  evidence_file="$MEDICATION_STOCK_EVIDENCE_FILE"
elif [[ -n "${RELEASE_EVIDENCE_DIR:-}" || -n "${RELEASE_ID:-}" ]]; then
  [[ -n "${RELEASE_EVIDENCE_DIR:-}" && -n "${RELEASE_ID:-}" ]] || {
    printf 'RELEASE_EVIDENCE_DIR and RELEASE_ID must be set together\n' >&2
    exit 1
  }
  [[ "$RELEASE_ID" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || {
    printf 'RELEASE_ID contains unsupported characters\n' >&2
    exit 1
  }
  evidence_file="$RELEASE_EVIDENCE_DIR/$RELEASE_ID/medication-stock-acceptance-evidence.json"
fi

write_evidence() {
  local status="$1"
  local completed_at="$2"
  local duration_ms="$3"

  node - "$evidence_file" "$status" "$started_at" "$completed_at" "$duration_ms" \
    "$test_total" "$test_passed" "$test_failed" "$test_skipped" "$test_todo" \
    "$commit_sha" "$commit_timestamp" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')

const [
  filePath,
  status,
  startedAt,
  completedAt,
  durationMs,
  total,
  passed,
  failed,
  skipped,
  todo,
  commitSha,
  commitTimestamp,
] = process.argv.slice(2)

const evidence = {
  schemaVersion: 1,
  status,
  startedAt,
  completedAt,
  durationMs: Number(durationMs),
  tests: {
    total: Number(total),
    passed: Number(passed),
    failed: Number(failed),
    skipped: Number(skipped),
    todo: Number(todo),
  },
  commit: {
    sha: commitSha || null,
    committedAt: commitTimestamp || null,
  },
}

const evidenceDirectory = path.dirname(filePath)
fs.mkdirSync(evidenceDirectory, { recursive: true, mode: 0o700 })
fs.chmodSync(evidenceDirectory, 0o700)
fs.writeFileSync(filePath, `${JSON.stringify(evidence, null, 2)}\n`, {
  encoding: 'utf8',
  mode: 0o600,
})
fs.chmodSync(filePath, 0o600)
NODE
}

finish() {
  local run_status=$?
  local cleanup_status=0
  local finish_interrupted=0
  local completed_at
  local completed_ms
  local final_status

  trap - EXIT
  trap 'finish_interrupted=1' INT TERM
  set +e

  if [[ "$schema_created" -eq 1 ]]; then
    psql "$DATABASE_URL" -c "DROP SCHEMA IF EXISTS \"$schema\" CASCADE" >/dev/null 2>&1
    cleanup_status=$?
  fi
  rm -f "$test_log"

  completed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  completed_ms="$(date +%s%3N)"
  final_status="$run_status"
  [[ "$cleanup_status" -eq 0 ]] || final_status=1
  [[ "$finish_interrupted" -eq 0 ]] || final_status=1

  if [[ -n "$database_acceptance_evidence_file" ]]; then
    if [[ "$final_status" -eq 0 ]]; then
      bash "$script_dir/write-database-acceptance-evidence.sh" \
        "$database_acceptance_evidence_file" none passed "$final_status"
    else
      bash "$script_dir/write-database-acceptance-evidence.sh" \
        "$database_acceptance_evidence_file" "$failure_category" failed "$final_status"
    fi
  elif [[ "$final_status" -eq 0 ]]; then
    write_evidence passed "$completed_at" "$((completed_ms - started_ms))"
  else
    write_evidence failed "$completed_at" "$((completed_ms - started_ms))"
  fi
  if [[ "$?" -ne 0 ]]; then
    printf 'medication stock acceptance: failed to write privacy-safe evidence\n' >&2
    final_status=1
  fi
  [[ "$finish_interrupted" -eq 0 ]] || final_status=1

  if [[ "$final_status" -eq 0 ]]; then
    printf 'medication stock acceptance: PASS (tests=%s, duration_ms=%s, evidence=%s)\n' \
      "$test_total" "$((completed_ms - started_ms))" "$evidence_file"
  else
    printf 'medication stock acceptance: FAIL (tests=%s, passed=%s, failed=%s, skipped=%s, evidence=%s)\n' \
      "$test_total" "$test_passed" "$test_failed" "$test_skipped" "$evidence_file" >&2
  fi

  exit "$final_status"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

case "${MEDICATION_STOCK_DATABASE_TARGET:-}" in
  disposable|release-validation)
    ;;
  *)
    printf 'medication stock acceptance: MEDICATION_STOCK_DATABASE_TARGET must be disposable or release-validation\n' >&2
    exit 1
    ;;
esac

[[ -n "${DATABASE_URL:-}" ]] || {
  printf 'DATABASE_URL is required\n' >&2
  exit 1
}

if ! DATABASE_URL="$DATABASE_URL" node - <<'NODE' >/dev/null 2>&1
const value = process.env.DATABASE_URL

try {
  const url = new URL(value)
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    process.exit(2)
  }

  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
  decodeURIComponent(url.username)
  decodeURIComponent(url.password)
  if (!url.hostname || !databaseName) process.exit(2)
} catch {
  process.exit(2)
}
NODE
then
  printf 'medication stock acceptance: DATABASE_URL must be a valid PostgreSQL URL with a database name\n' >&2
  exit 1
fi

configured_target="$MEDICATION_STOCK_DATABASE_TARGET"
database_target=""
if ! database_target="$(
  psql -X -q -A -t -v ON_ERROR_STOP=1 "$DATABASE_URL" \
    -c "SELECT split_part(setting, '=', 2)
          FROM pg_db_role_setting
          CROSS JOIN LATERAL unnest(setconfig) AS config(setting)
         WHERE setdatabase = (SELECT oid FROM pg_database WHERE datname = current_database())
           AND setrole = 0
           AND setting LIKE 'syntropic.acceptance_target=%'
         LIMIT 1" \
    2>/dev/null
)"; then
  printf 'medication stock acceptance: unable to verify database target identity\n' >&2
  exit 1
fi

if [[ "$database_target" != "$configured_target" ]]; then
  printf 'medication stock acceptance: database target identity does not match the configured target\n' >&2
  exit 1
fi

schema="medication_acceptance_$(date +%s)_$$"
[[ "$schema" =~ ^[a-z0-9_]+$ ]]

# Set this before CREATE so an interrupted or failed CREATE is still followed
# by a safe DROP IF EXISTS for this unique schema name.
schema_created=1
psql "$DATABASE_URL" -c "CREATE SCHEMA \"$schema\"" >/dev/null 2>&1
test_database_url="$(
  SCHEMA="$schema" node -e '
    const url = new URL(process.env.DATABASE_URL)
    url.searchParams.set("schema", process.env.SCHEMA)
    process.stdout.write(url.toString())
  '
  2>/dev/null
)"

failure_category="migration"
DATABASE_URL="$test_database_url" prisma migrate deploy >/dev/null 2>&1

set +e
failure_category="test"
DATABASE_URL="$test_database_url" MEDICATION_STOCK_DATABASE_TESTS=1 \
  pnpm exec tsx --test --experimental-test-module-mocks tests/medication-stock-db.test.ts \
  >"$test_log" 2>&1
test_status=$?
set -e

read -r test_total test_passed test_failed test_skipped test_todo < <(
  node - "$test_log" <<'NODE'
const fs = require('node:fs')
const output = fs.readFileSync(process.argv[2], 'utf8')

const metric = (name) => {
  const match = output.match(new RegExp(`^ℹ ${name} (\\d+)$`, 'm'))
  return match ? Number(match[1]) : 0
}

process.stdout.write([
  metric('tests'),
  metric('pass'),
  metric('fail'),
  metric('skipped'),
  metric('todo'),
].join(' ') + '\n')
NODE
)

if [[ "$test_status" -ne 0 ]]; then
  exit "$test_status"
fi

exit 0
