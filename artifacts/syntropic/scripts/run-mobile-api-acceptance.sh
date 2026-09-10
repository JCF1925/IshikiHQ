#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=verify-database-acceptance-target.sh
source "$script_dir/verify-database-acceptance-target.sh"

evidence_file="${DATABASE_ACCEPTANCE_EVIDENCE_FILE:-}"
failure_category="connection"
schema=""
schema_created=0
test_log="$(mktemp "${TMPDIR:-/tmp}/syntropic-mobile-api.XXXXXX.log")"

finish() {
  local run_status=$?
  local cleanup_status=0
  local final_status

  trap - EXIT
  set +e

  if [[ "$schema_created" -eq 1 ]]; then
    psql "$DATABASE_URL" -c "DROP SCHEMA IF EXISTS \"$schema\" CASCADE" >/dev/null 2>&1
    cleanup_status=$?
  fi
  rm -f "$test_log"

  final_status="$run_status"
  [[ "$cleanup_status" -eq 0 ]] || final_status=1

  if [[ -n "$evidence_file" ]]; then
    if [[ "$final_status" -eq 0 ]]; then
      bash "$script_dir/write-database-acceptance-evidence.sh" \
        "$evidence_file" none passed "$final_status"
    else
      bash "$script_dir/write-database-acceptance-evidence.sh" \
        "$evidence_file" "$failure_category" failed "$final_status"
    fi
    if [[ "$?" -ne 0 ]]; then
      printf 'mobile API acceptance: failed to write privacy-safe evidence\n' >&2
      final_status=1
    fi
  fi

  if [[ "$final_status" -eq 0 ]]; then
    printf 'mobile API acceptance: PASS%s\n' \
      "${evidence_file:+ (evidence=$evidence_file)}"
  else
    printf 'mobile API acceptance: FAIL (evidence=%s)\n' "${evidence_file:-not-requested}" >&2
  fi

  exit "$final_status"
}
trap finish EXIT

[[ -n "${DATABASE_URL:-}" ]] || {
  printf 'DATABASE_URL is required\n' >&2
  exit 1
}

verify_database_acceptance_target "${DATABASE_ACCEPTANCE_TARGET:-}"

if [[ -n "${MOBILE_API_ACCEPTANCE_DATABASE_URL:-}" ]]; then
  test_database_url="$MOBILE_API_ACCEPTANCE_DATABASE_URL"
  schema="${MOBILE_API_ACCEPTANCE_SCHEMA:-}"
  [[ "$schema" =~ ^[a-z0-9_]+$ ]] || {
    printf 'MOBILE_API_ACCEPTANCE_SCHEMA must contain only lowercase letters, numbers, and underscores\n' >&2
    exit 1
  }
  verify_database_acceptance_target "${DATABASE_ACCEPTANCE_TARGET:-}" "$test_database_url"
else
  schema="mobile_api_acceptance_$(date +%s)_$$"
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
    ' 2>/dev/null
  )"
fi

# Prisma owns the schema history. The API uses Drizzle at runtime, so keep its
# connection on the same disposable schema with PostgreSQL's search_path.
failure_category="migration"
DATABASE_URL="$test_database_url" prisma migrate deploy >/dev/null 2>&1
failure_category="test"
set +e
DATABASE_URL="$test_database_url" \
PGOPTIONS="-c search_path=$schema" \
  MOBILE_API_DATABASE_TESTS=1 \
  pnpm exec tsx --test --experimental-test-module-mocks \
  "$PWD/tests/mobile-api-process.integration.test.ts" >"$test_log" 2>&1
test_status=$?
set -e

if [[ "$test_status" -ne 0 ]]; then
  exit "$test_status"
fi

exit 0