#!/usr/bin/env bash
set -Eeuo pipefail

# This is a shell-level regression test for run-medication-stock-acceptance.sh.
# It replaces the external database and test commands so most target validation
# and evidence behavior can be checked without applying migrations. The final
# check uses a real disposable PostgreSQL cluster to verify that connection
# options cannot override database-level target identity.
# It also checks the release evidence verifier without credentials.

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
wrapper="$script_dir/run-medication-stock-acceptance.sh"
verifier="$script_dir/verify-medication-stock-acceptance.sh"
test_dir="$(mktemp -d "${TMPDIR:-/tmp}/syntropic-medication-stock-wrapper.XXXXXX")"
fake_bin="$test_dir/bin"
call_log="$test_dir/calls.log"
wrapper_tmp_dir="$test_dir/tmp"
release_evidence_dir="$test_dir/release-evidence"
database_url='postgresql://acceptance-user:super-secret@shared.example:5432/syntropic_shared?sslmode=require'
private_identifier='user-test-identifier-42'
private_payload='{"medication":"private-medication","dose":"payload"}'
raw_failure_output='RAW_ACCEPTANCE_OUTPUT_SHOULD_NOT_BE_RETAINED'
real_pg_root=""
real_pg_socket=""
real_pg_data=""
mkdir -p "$fake_bin" "$wrapper_tmp_dir"
touch "$call_log"

cleanup() {
  if [[ -n "$real_pg_data" ]]; then
    pg_ctl -D "$real_pg_data" -m immediate -w stop >/dev/null 2>&1 || true
  fi
  if [[ -n "$real_pg_root" ]]; then
    rm -rf "$real_pg_root"
  fi
  rm -rf "$test_dir"
}
trap cleanup EXIT INT TERM

cat >"$fake_bin/psql" <<'FAKE_PSQL'
#!/usr/bin/env bash
set -Eeuo pipefail
printf 'psql %s\n' "$*" >>"${MEDICATION_STOCK_WRAPPER_CALL_LOG:?}"
if [[ "${MEDICATION_STOCK_WRAPPER_PSQL_MODE:-}" == "reject" &&
  "$*" == *"pg_db_role_setting"* ]]; then
  printf 'psql: FATAL: password authentication failed for user "acceptance-user" at host "shared.example", database "syntropic_shared"\n' >&2
  exit 2
fi
if [[ "${MEDICATION_STOCK_WRAPPER_INTERRUPT_STAGE:-}" == "setup" &&
  "$*" == *"pg_db_role_setting"* ]]; then
  printf '%s %s %s\n' \
    "${MEDICATION_STOCK_WRAPPER_PRIVATE_IDENTIFIER:?}" \
    "${MEDICATION_STOCK_WRAPPER_PRIVATE_PAYLOAD:?}" \
    "${MEDICATION_STOCK_WRAPPER_RAW_FAILURE_OUTPUT:?}" >&2
  : >"${MEDICATION_STOCK_WRAPPER_INTERRUPT_MARKER:?}"
  trap 'exit 143' TERM INT
  while true; do sleep 1; done
fi
if [[ "$*" == *"pg_db_role_setting"* ]]; then
  printf '%s\n' "${MEDICATION_STOCK_WRAPPER_DATABASE_TARGET:-}"
fi
if [[ "$*" == *"CREATE SCHEMA "* ]]; then
  : >"${MEDICATION_STOCK_WRAPPER_SCHEMA_CREATED_MARKER:-/dev/null}"
fi
if [[ "$*" == *"DROP SCHEMA "* ]]; then
  : >"${MEDICATION_STOCK_WRAPPER_SCHEMA_CLEANUP_MARKER:-/dev/null}"
  if [[ "${MEDICATION_STOCK_WRAPPER_INTERRUPT_STAGE:-}" == "cleanup" ]]; then
    printf '%s %s %s\n' \
      "${MEDICATION_STOCK_WRAPPER_PRIVATE_IDENTIFIER:?}" \
      "${MEDICATION_STOCK_WRAPPER_PRIVATE_PAYLOAD:?}" \
      "${MEDICATION_STOCK_WRAPPER_RAW_FAILURE_OUTPUT:?}" >&2
    : >"${MEDICATION_STOCK_WRAPPER_INTERRUPT_MARKER:?}"
    trap 'exit 143' TERM INT
    while true; do sleep 1; done
  fi
fi
FAKE_PSQL

cat >"$fake_bin/prisma" <<'FAKE_PRISMA'
#!/usr/bin/env bash
set -Eeuo pipefail
printf 'prisma %s\n' "$*" >>"${MEDICATION_STOCK_WRAPPER_CALL_LOG:?}"
if [[ "${MEDICATION_STOCK_WRAPPER_INTERRUPT_STAGE:-}" == "migration" ]]; then
  printf '%s %s %s\n' \
    "${MEDICATION_STOCK_WRAPPER_PRIVATE_IDENTIFIER:?}" \
    "${MEDICATION_STOCK_WRAPPER_PRIVATE_PAYLOAD:?}" \
    "${MEDICATION_STOCK_WRAPPER_RAW_FAILURE_OUTPUT:?}" >&2
  : >"${MEDICATION_STOCK_WRAPPER_INTERRUPT_MARKER:?}"
  trap 'exit 143' TERM INT
  while true; do
    sleep 1
  done
fi
FAKE_PRISMA

cat >"$fake_bin/pnpm" <<'FAKE_PNPM'
#!/usr/bin/env bash
set -Eeuo pipefail
printf 'pnpm %s\n' "$*" >>"${MEDICATION_STOCK_WRAPPER_CALL_LOG:?}"
if [[ "${MEDICATION_STOCK_WRAPPER_TEST_MODE:-pass}" == "fail" ]]; then
  printf 'acceptance failure: %s %s %s\n' \
    "${MEDICATION_STOCK_WRAPPER_PRIVATE_IDENTIFIER:?}" \
    "${MEDICATION_STOCK_WRAPPER_PRIVATE_PAYLOAD:?}" \
    "${MEDICATION_STOCK_WRAPPER_RAW_FAILURE_OUTPUT:?}" >&2
  printf 'ℹ tests 4\nℹ pass 2\nℹ fail 1\nℹ skipped 1\nℹ todo 0\n'
  exit 17
fi
printf 'ℹ tests 3\nℹ pass 3\nℹ fail 0\nℹ skipped 0\nℹ todo 0\n'
FAKE_PNPM

chmod +x "$fake_bin/psql" "$fake_bin/prisma" "$fake_bin/pnpm"

run_wrapper() {
  local label="$1"
  local target="$2"
  local database_target="${3:-}"
  local mode="${4:-pass}"
  local evidence_mode="${5:-legacy}"
  local database_url_override="${6:-$database_url}"
  local psql_mode="${7:-}"
  local release_id="${8:-release-record}"
  local output_file="$test_dir/$label.log"
  local evidence_file="$release_evidence_dir/$release_id/medication-stock-acceptance-evidence.json"
  local -a evidence_environment
  local status=0

  if [[ "$evidence_mode" == "shared" ]]; then
    evidence_file="$test_dir/$label.evidence"
    evidence_environment=("DATABASE_ACCEPTANCE_EVIDENCE_FILE=$evidence_file")
  else
    evidence_environment=(
      "RELEASE_EVIDENCE_DIR=$release_evidence_dir"
      "RELEASE_ID=$release_id"
    )
  fi

  : >"$call_log"
  if [[ "$target" == "<missing>" ]]; then
    (
      cd "$test_dir"
      env -u MEDICATION_STOCK_DATABASE_TARGET \
        PATH="$fake_bin:$PATH" \
        TMPDIR="$wrapper_tmp_dir" \
        DATABASE_URL="$database_url_override" \
        MEDICATION_STOCK_WRAPPER_CALL_LOG="$call_log" \
        "${evidence_environment[@]}" \
        MEDICATION_STOCK_WRAPPER_TEST_MODE="$mode" \
        MEDICATION_STOCK_WRAPPER_PSQL_MODE="$psql_mode" \
        MEDICATION_STOCK_WRAPPER_PRIVATE_IDENTIFIER="$private_identifier" \
        MEDICATION_STOCK_WRAPPER_PRIVATE_PAYLOAD="$private_payload" \
        MEDICATION_STOCK_WRAPPER_RAW_FAILURE_OUTPUT="$raw_failure_output" \
        MEDICATION_STOCK_WRAPPER_DATABASE_TARGET="$database_target" \
        bash "$wrapper" >"$output_file" 2>&1
    ) || status=$?
  else
    (
      cd "$test_dir"
      env \
        PATH="$fake_bin:$PATH" \
        TMPDIR="$wrapper_tmp_dir" \
        DATABASE_URL="$database_url_override" \
        MEDICATION_STOCK_DATABASE_TARGET="$target" \
        MEDICATION_STOCK_WRAPPER_CALL_LOG="$call_log" \
        "${evidence_environment[@]}" \
        MEDICATION_STOCK_WRAPPER_TEST_MODE="$mode" \
        MEDICATION_STOCK_WRAPPER_PSQL_MODE="$psql_mode" \
        MEDICATION_STOCK_WRAPPER_PRIVATE_IDENTIFIER="$private_identifier" \
        MEDICATION_STOCK_WRAPPER_PRIVATE_PAYLOAD="$private_payload" \
        MEDICATION_STOCK_WRAPPER_RAW_FAILURE_OUTPUT="$raw_failure_output" \
        MEDICATION_STOCK_WRAPPER_DATABASE_TARGET="$database_target" \
        bash "$wrapper" >"$output_file" 2>&1
    ) || status=$?
  fi

  if find "$wrapper_tmp_dir" -maxdepth 1 -type f -name 'syntropic-medication-stock.*.log' -print -quit |
    grep -q .; then
    printf '%s retained its temporary acceptance log\n' "$label" >&2
    exit 1
  fi

  printf '%s %s %s\n' "$status" "$evidence_file" "$output_file"
}

assert_output_has_no_forbidden_values() {
  local output_file="$1"
  shift

  local forbidden_value
  for forbidden_value in "$@"; do
    [[ -z "$forbidden_value" ]] && continue
    if grep -Fq -- "$forbidden_value" "$output_file"; then
      printf 'acceptance output exposed a forbidden value\n' >&2
      exit 1
    fi
  done
}

assert_rejected_before_commands() {
  local label="$1"
  local rejected_target="$2"
  local database_target="${3:-}"
  local status
  status="$(run_wrapper "$label" "$rejected_target" "$database_target" pass | awk '{print $1}')"

  [[ "$status" -ne 0 ]] ||
    { printf '%s target unexpectedly passed\n' "$label" >&2; exit 1; }
  if grep -Eq ' -c CREATE SCHEMA "|^prisma |^pnpm ' "$call_log"; then
    printf '%s target ran an acceptance command before rejection\n' "$label" >&2
    exit 1
  fi

  if grep -Fq "$database_url" "$test_dir/$label.log" ||
    { [[ "$rejected_target" != "<missing>" ]] &&
        grep -Fq "$rejected_target" "$test_dir/$label.log"; } ||
    { [[ -n "$database_target" ]] &&
        grep -Fq "$database_target" "$test_dir/$label.log"; }; then
    printf '%s rejection output exposed a database URL or target value\n' "$label" >&2
    exit 1
  fi
}

assert_rejected_before_commands missing-target '<missing>'
assert_rejected_before_commands shared-development shared-development
assert_rejected_before_commands missing-database-identity disposable ''
assert_rejected_before_commands mismatched-database-identity disposable shared-development

assert_evidence_shape() {
  local evidence_file="$1"
  local expected_status="$2"
  local expected_total="$3"
  local expected_passed="$4"
  local expected_failed="$5"
  local expected_skipped="$6"
  local expected_todo="$7"
  local label="$8"
  shift 8
  local -a additional_forbidden_values=("$@")

  [[ -f "$evidence_file" ]] ||
    { printf '%s did not write evidence\n' "$label" >&2; exit 1; }
  [[ ! -L "$evidence_file" ]] ||
    { printf '%s evidence must not be a symlink\n' "$label" >&2; exit 1; }
  [[ "$(stat -c '%a' "$evidence_file")" == "600" ]] ||
    { printf '%s evidence did not have mode 0600\n' "$label" >&2; exit 1; }
  [[ "$(stat -c '%a' "$(dirname "$evidence_file")")" == "700" ]] ||
    { printf '%s release directory did not have mode 0700\n' "$label" >&2; exit 1; }

  node - "$evidence_file" "$expected_status" "$expected_total" "$expected_passed" \
    "$expected_failed" "$expected_skipped" "$expected_todo" "$database_url" \
    "$private_identifier" "$private_payload" "$raw_failure_output" \
    "${additional_forbidden_values[@]}" <<'NODE'
const fs = require('node:fs')

const [
  filePath,
  expectedStatus,
  expectedTotal,
  expectedPassed,
  expectedFailed,
  expectedSkipped,
  expectedTodo,
  ...forbiddenValues
] = process.argv.slice(2)
const evidence = JSON.parse(fs.readFileSync(filePath, 'utf8'))

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}
const exactKeys = (value, keys, label) => {
  assert(
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort()),
    `${label} keys were not allowlisted: ${Object.keys(value).join(', ')}`,
  )
}

exactKeys(evidence, [
  'schemaVersion',
  'status',
  'startedAt',
  'completedAt',
  'durationMs',
  'tests',
  'commit',
], 'evidence')
exactKeys(evidence.tests, ['total', 'passed', 'failed', 'skipped', 'todo'], 'test counts')
exactKeys(evidence.commit, ['sha', 'committedAt'], 'commit metadata')

assert(evidence.schemaVersion === 1, 'unexpected evidence schema version')
assert(evidence.status === expectedStatus, `expected ${expectedStatus} status`)
assert(Number.isInteger(evidence.durationMs) && evidence.durationMs >= 0, 'invalid duration')
assert(typeof evidence.startedAt === 'string' && typeof evidence.completedAt === 'string',
  'missing evidence timestamps')
assert(evidence.tests.total === Number(expectedTotal), 'unexpected total count')
assert(evidence.tests.passed === Number(expectedPassed), 'unexpected passed count')
assert(evidence.tests.failed === Number(expectedFailed), 'unexpected failed count')
assert(evidence.tests.skipped === Number(expectedSkipped), 'unexpected skipped count')
assert(evidence.tests.todo === Number(expectedTodo), 'unexpected todo count')
assert(
  (evidence.commit.sha === null || /^[0-9a-f]+$/.test(evidence.commit.sha)) &&
    (evidence.commit.committedAt === null || typeof evidence.commit.committedAt === 'string'),
  'invalid commit metadata',
)

const serialized = JSON.stringify(evidence)
for (const forbiddenValue of forbiddenValues) {
  if (!forbiddenValue) continue
  assert(!serialized.includes(forbiddenValue), `forbidden value was retained: ${forbiddenValue}`)
}
assert(!serialized.includes('medication_acceptance_'), 'disposable schema name was retained')
NODE
}

assert_invalid_database_url() {
  local label="$1"
  local invalid_url="$2"
  local username="${3:-}"
  local password="${4:-}"
  local host="${5:-}"
  local database_name="${6:-}"
  local status
  local evidence_file
  local output_file

  read -r status evidence_file output_file < <(
    run_wrapper "$label" disposable disposable pass legacy "$invalid_url"
  )
  [[ "$status" -ne 0 ]] ||
    { printf '%s invalid URL unexpectedly passed\n' "$label" >&2; exit 1; }
  grep -Fxq \
    'medication stock acceptance: DATABASE_URL must be a valid PostgreSQL URL with a database name' \
    "$output_file" ||
    { printf '%s did not return the stable invalid URL error\n' "$label" >&2; exit 1; }
  [[ ! -s "$call_log" ]] ||
    { printf '%s ran a database client before rejecting the URL\n' "$label" >&2; exit 1; }
  assert_output_has_no_forbidden_values "$output_file" \
    "$invalid_url" "$username" "$password" "$host" "$database_name" \
    'medication_acceptance_'
  assert_evidence_shape "$evidence_file" failed 0 0 0 0 0 "$label" \
    "$invalid_url" "$username" "$password" "$host" "$database_name"
}

assert_invalid_database_url \
  malformed-postgresql-url \
  'postgresql://malformed-user:malformed-secret@malformed.example:5432/%E0%A4%A' \
  malformed-user malformed-secret malformed.example
assert_invalid_database_url \
  non-postgresql-url \
  'mysql://wrong-user:wrong-secret@wrong.example:3306/wrong_database' \
  wrong-user wrong-secret wrong.example wrong_database
assert_invalid_database_url \
  missing-database-name \
  'postgresql://missing-user:missing-secret@missing.example:5432/' \
  missing-user missing-secret missing.example

read -r rejected_status rejected_evidence_file rejected_output_file < <(
  run_wrapper rejected-database-client disposable disposable pass legacy "$database_url" reject
)
[[ "$rejected_status" -ne 0 ]] ||
  { printf 'rejected database client unexpectedly passed\n' >&2; exit 1; }
grep -Fxq \
  'medication stock acceptance: unable to verify database target identity' \
  "$rejected_output_file" ||
  { printf 'rejected database client did not return the stable aggregate error\n' >&2; exit 1; }
assert_output_has_no_forbidden_values "$rejected_output_file" \
  "$database_url" acceptance-user super-secret shared.example syntropic_shared \
  'medication_acceptance_'
assert_evidence_shape "$rejected_evidence_file" failed 0 0 0 0 0 rejected-database-client \
  "$database_url" acceptance-user super-secret shared.example syntropic_shared

for target in disposable release-validation; do
  read -r status evidence_file _ < <(run_wrapper "allowed-$target" "$target" "$target")
  [[ "$status" -eq 0 ]] ||
    { printf '%s target did not reach the stubbed acceptance stages\n' "$target" >&2; exit 1; }

  [[ "$(grep -c '^psql ' "$call_log")" -eq 3 ]] ||
    { printf '%s target did not verify, create, and clean up its schema\n' "$target" >&2; exit 1; }
  grep -q 'pg_db_role_setting' "$call_log" ||
    { printf '%s target did not verify database target identity\n' "$target" >&2; exit 1; }
  grep -q ' -c CREATE SCHEMA "' "$call_log" ||
    { printf '%s target did not attempt schema creation\n' "$target" >&2; exit 1; }
  grep -q '^prisma migrate deploy$' "$call_log" ||
    { printf '%s target did not attempt migrations\n' "$target" >&2; exit 1; }
  grep -q '^pnpm exec tsx --test --experimental-test-module-mocks tests/medication-stock-db.test.ts$' \
    "$call_log" ||
    { printf '%s target did not attempt the acceptance test\n' "$target" >&2; exit 1; }
  assert_evidence_shape "$evidence_file" passed 3 3 0 0 0 "allowed-$target"
done

rerun_release_id='rerun-permissions'
rerun_release_directory="$release_evidence_dir/$rerun_release_id"
mkdir -p "$rerun_release_directory"
chmod 0777 "$rerun_release_directory"
read -r rerun_status rerun_evidence_file _ < <(
  run_wrapper rerun-permissive-directory disposable disposable pass legacy "$database_url" '' "$rerun_release_id"
)
[[ "$rerun_status" -eq 0 ]] ||
  { printf 'rerun with an existing permissive release directory did not pass\n' >&2; exit 1; }
assert_evidence_shape "$rerun_evidence_file" passed 3 3 0 0 0 rerun-permissive-directory

read -r failed_status failed_evidence_file _ < <(run_wrapper "failed-acceptance" disposable disposable fail)
[[ "$failed_status" -ne 0 ]] ||
  { printf 'failed acceptance unexpectedly passed\n' >&2; exit 1; }
[[ "$failed_status" -eq 17 ]] ||
  { printf 'failed acceptance returned %s instead of the acceptance failure status\n' "$failed_status" >&2; exit 1; }
[[ "$(grep -c '^psql ' "$call_log")" -eq 3 ]] ||
  { printf 'failed acceptance did not clean up its schema\n' >&2; exit 1; }
assert_evidence_shape "$failed_evidence_file" failed 4 2 1 1 0 failed-acceptance

assert_shared_evidence_shape() {
  local evidence_file="$1"
  local expected_category="$2"
  local expected_status="$3"
  local expected_exit_code="$4"
  local output_file="$5"

  [[ -f "$evidence_file" ]] ||
    { printf 'shared medication evidence was not written\n' >&2; exit 1; }
  [[ "$(stat -c '%a' "$evidence_file")" == "600" ]] ||
    { printf 'shared medication evidence did not have mode 0600\n' >&2; exit 1; }
  [[ "$(stat -c '%a' "$(dirname "$evidence_file")")" == "700" ]] ||
    { printf 'shared medication evidence directory did not have mode 0700\n' >&2; exit 1; }
  [[ "$(cat "$evidence_file")" == \
"category=$expected_category
status=$expected_status
exit_code=$expected_exit_code" ]] ||
    { printf 'shared medication evidence did not match the shared contract\n' >&2; exit 1; }

  if grep -Fq "$database_url" "$evidence_file" ||
    grep -Fq "$private_identifier" "$evidence_file" ||
    grep -Fq "$private_payload" "$evidence_file" ||
    grep -Fq "$raw_failure_output" "$evidence_file" ||
    grep -Fq "$database_url" "$output_file" ||
    grep -Fq "$private_identifier" "$output_file" ||
    grep -Fq "$private_payload" "$output_file" ||
    grep -Fq "$raw_failure_output" "$output_file"; then
    printf 'shared medication acceptance exposed private values\n' >&2
    exit 1
  fi
}

read -r shared_status shared_evidence_file shared_output_file < <(
  run_wrapper shared-failure disposable disposable fail shared
)
[[ "$shared_status" -eq 17 ]] ||
  { printf 'shared medication acceptance returned %s instead of 17\n' "$shared_status" >&2; exit 1; }
assert_shared_evidence_shape "$shared_evidence_file" test failed 17 "$shared_output_file"

assert_interrupted_stage() {
  local stage="$1"
  local expected_total="$2"
  local expected_passed="$3"
  local label="interrupted-$stage"
  local output_file="$test_dir/$label.log"
  local status_file="$test_dir/$label.status"
  local interrupt_marker="$test_dir/$label.marker"
  local schema_marker="$test_dir/$label.schema-created"
  local cleanup_marker="$test_dir/$label.schema-cleaned"
  local release_id="$label-release"
  local evidence_file="$release_evidence_dir/$release_id/medication-stock-acceptance-evidence.json"
  local runner_status
  local interrupted_schema_name
  local cleaned_schema_name

  : >"$call_log"
  (
    cd "$test_dir"
    env \
      PATH="$fake_bin:$PATH" \
      TMPDIR="$wrapper_tmp_dir" \
      DATABASE_URL="$database_url" \
      MEDICATION_STOCK_DATABASE_TARGET=disposable \
      MEDICATION_STOCK_WRAPPER_CALL_LOG="$call_log" \
      MEDICATION_STOCK_WRAPPER_DATABASE_TARGET=disposable \
      MEDICATION_STOCK_WRAPPER_INTERRUPT_STAGE="$stage" \
      MEDICATION_STOCK_WRAPPER_INTERRUPT_MARKER="$interrupt_marker" \
      MEDICATION_STOCK_WRAPPER_SCHEMA_CREATED_MARKER="$schema_marker" \
      MEDICATION_STOCK_WRAPPER_SCHEMA_CLEANUP_MARKER="$cleanup_marker" \
      MEDICATION_STOCK_WRAPPER_PRIVATE_IDENTIFIER="$private_identifier" \
      MEDICATION_STOCK_WRAPPER_PRIVATE_PAYLOAD="$private_payload" \
      MEDICATION_STOCK_WRAPPER_RAW_FAILURE_OUTPUT="$raw_failure_output" \
      RELEASE_EVIDENCE_DIR="$release_evidence_dir" \
      RELEASE_ID="$release_id" \
      setsid bash "$wrapper" >"$output_file" 2>&1 &
    runner_pid=$!

    deadline=$((SECONDS + 10))
    while (( SECONDS < deadline )) && [[ ! -f "$interrupt_marker" ]]; do
      if ! kill -0 "$runner_pid" 2>/dev/null; then
        break
      fi
      sleep 0.05
    done

    if [[ ! -f "$interrupt_marker" ]]; then
      kill -TERM -- "-$runner_pid" 2>/dev/null || true
      wait "$runner_pid" 2>/dev/null || true
      exit 1
    fi

    kill -TERM -- "-$runner_pid"
    set +e
    wait "$runner_pid"
    runner_status=$?
    set -e
    printf '%s' "$runner_status" >"$status_file"
  )

  [[ -f "$status_file" ]] ||
    { printf '%s did not record a runner status\n' "$label" >&2; exit 1; }
  runner_status="$(cat "$status_file")"
  [[ "$runner_status" -ne 0 ]] ||
    { printf '%s unexpectedly passed\n' "$label" >&2; exit 1; }

  interrupted_schema_name="$(
    sed -n 's/.*CREATE SCHEMA "\([^"]*\)".*/\1/p' "$call_log"
  )"
  cleaned_schema_name="$(
    sed -n 's/.*DROP SCHEMA IF EXISTS "\([^"]*\)".*/\1/p' "$call_log"
  )"

  if [[ "$stage" == "setup" ]]; then
    [[ -z "$interrupted_schema_name" && -z "$cleaned_schema_name" && ! -f "$schema_marker" ]] ||
      { printf '%s created or cleaned a schema before setup completed\n' "$label" >&2; exit 1; }
  else
    [[ -f "$schema_marker" && -f "$cleanup_marker" ]] ||
      { printf '%s did not create and attempt to clean its schema\n' "$label" >&2; exit 1; }
    [[ -n "$interrupted_schema_name" && "$interrupted_schema_name" == "$cleaned_schema_name" ]] ||
      { printf '%s cleaned up a different schema\n' "$label" >&2; exit 1; }
  fi

  assert_output_has_no_forbidden_values "$output_file" \
    "$database_url" "$interrupted_schema_name" "$private_identifier" \
    "$private_payload" "$raw_failure_output"
  assert_evidence_shape "$evidence_file" failed "$expected_total" "$expected_passed" 0 0 0 \
    "$label" "$interrupted_schema_name"

  if find "$wrapper_tmp_dir" -maxdepth 1 -type f -name 'syntropic-medication-stock.*.log' -print -quit |
    grep -q .; then
    printf '%s retained its temporary acceptance log\n' "$label" >&2
    exit 1
  fi
  if grep -FRq -- "$private_identifier" "$wrapper_tmp_dir" ||
    grep -FRq -- "$private_payload" "$wrapper_tmp_dir" ||
    grep -FRq -- "$raw_failure_output" "$wrapper_tmp_dir"; then
    printf '%s retained private fixture output in its temporary directory\n' "$label" >&2
    exit 1
  fi
}

assert_interrupted_stage setup 0 0
assert_interrupted_stage migration 0 0
assert_interrupted_stage cleanup 3 3

for command in initdb pg_ctl psql; do
  command -v "$command" >/dev/null 2>&1 ||
    { printf 'real PostgreSQL target identity regression requires %s\n' "$command" >&2; exit 1; }
done

real_pg_root="$(mktemp -d "${TMPDIR:-/tmp}/syntropic-medication-stock-postgres.XXXXXX")"
real_pg_socket="$real_pg_root/socket"
real_pg_data="$real_pg_root/data"
mkdir -p "$real_pg_socket"
fixture_role="$(id -un)"

initdb \
  --no-locale \
  --encoding=UTF8 \
  --auth=trust \
  --username="$fixture_role" \
  --pgdata="$real_pg_data" \
  >"$real_pg_root/initdb.log" 2>&1
pg_ctl \
  --pgdata="$real_pg_data" \
  --options="-k $real_pg_socket" \
  --log="$real_pg_root/postgres.log" \
  --wait \
  start >/dev/null

real_psql() {
  PGHOST="$real_pg_socket" PGUSER="$fixture_role" \
    psql --no-psqlrc --quiet --set=ON_ERROR_STOP=1 "$@"
}

real_admin_url='postgresql:///postgres'
real_approved_url='postgresql:///medication_target_approved'
real_shared_url='postgresql:///medication_target_shared?options=-c%20syntropic.acceptance_target%3Ddisposable'
real_target_query="SELECT split_part(setting, '=', 2)
  FROM pg_db_role_setting
  CROSS JOIN LATERAL unnest(setconfig) AS config(setting)
 WHERE setdatabase = (SELECT oid FROM pg_database WHERE datname = current_database())
   AND setrole = 0
   AND setting LIKE 'syntropic.acceptance_target=%'
 LIMIT 1"

real_psql "$real_admin_url" -c 'CREATE DATABASE medication_target_approved'
real_psql "$real_admin_url" -c 'CREATE DATABASE medication_target_shared'
real_psql "$real_admin_url" \
  -c "ALTER DATABASE medication_target_approved SET syntropic.acceptance_target = 'disposable'"
real_psql "$real_admin_url" \
  -c "ALTER DATABASE medication_target_shared SET syntropic.acceptance_target = 'shared-development'"

[[ "$(real_psql "$real_approved_url" -Atc "$real_target_query")" == "disposable" ]] ||
  { printf 'approved fixture did not retain its database-level target identity\n' >&2; exit 1; }
[[ "$(real_psql "$real_shared_url" -Atc "$real_target_query")" == "shared-development" ]] ||
  { printf 'shared fixture did not retain its database-level target identity\n' >&2; exit 1; }
[[ "$(real_psql "$real_shared_url" -Atc 'SHOW syntropic.acceptance_target')" == "disposable" ]] ||
  { printf 'shared fixture did not accept the approved session connection option\n' >&2; exit 1; }

real_output_file="$test_dir/real-postgres-target-rejection.log"
real_evidence_dir="$test_dir/real-postgres-evidence"
real_release_id='real-postgres-target-rejection'
real_evidence_file="$real_evidence_dir/$real_release_id/medication-stock-acceptance-evidence.json"
set +e
(
  cd "$test_dir"
  env \
    PGHOST="$real_pg_socket" \
    PGUSER="$fixture_role" \
    DATABASE_URL="$real_shared_url" \
    RELEASE_EVIDENCE_DIR="$real_evidence_dir" \
    RELEASE_ID="$real_release_id" \
    MEDICATION_STOCK_DATABASE_TARGET=disposable \
    bash "$wrapper" >"$real_output_file" 2>&1
)
real_status=$?
set -e

[[ "$real_status" -ne 0 ]] ||
  { printf 'shared database with approved connection options unexpectedly passed\n' >&2; exit 1; }
[[ "$(real_psql "$real_shared_url" -Atc \
  "SELECT count(*) FROM pg_namespace WHERE nspname LIKE 'medication_acceptance_%'")" == "0" ]] ||
  { printf 'shared database rejection created an acceptance schema\n' >&2; exit 1; }
[[ -f "$real_evidence_file" ]] ||
  { printf 'shared database rejection did not write evidence\n' >&2; exit 1; }

if grep -Fq "$real_shared_url" "$real_output_file" ||
  grep -Fq 'disposable' "$real_output_file" ||
  grep -Fq 'shared-development' "$real_output_file" ||
  grep -Fq "$real_shared_url" "$real_evidence_file" ||
  grep -Fq 'disposable' "$real_evidence_file" ||
  grep -Fq 'shared-development' "$real_evidence_file"; then
  printf 'shared database rejection exposed connection or target identity details\n' >&2
  exit 1
fi

node - "$real_evidence_file" <<'NODE'
const fs = require('node:fs')

const evidence = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
if (evidence.status !== 'failed' || evidence.schemaVersion !== 1) {
  throw new Error('shared database rejection did not write failed privacy-safe evidence')
}
if (JSON.stringify(evidence).includes('medication_acceptance_')) {
  throw new Error('shared database rejection evidence retained a schema name')
}
NODE

repo_root="$(git -C "$script_dir" rev-parse --show-toplevel)"
verifier_release_id='release-record'
verifier_release_dir="$test_dir/verifier-release-evidence"
verifier_release_file="$verifier_release_dir/$verifier_release_id/medication-stock-acceptance-evidence.json"
verifier_output_dir="$test_dir/verifier-output"
verifier_private_marker='PRIVATE_VERIFIER_FIXTURE_VALUE_MUST_NOT_BE_PRINTED'
expected_commit_sha="$(git -C "$repo_root" rev-parse --verify HEAD)"
expected_commit_timestamp="$(git -C "$repo_root" show -s --format=%cI HEAD)"
mkdir -p "$verifier_output_dir"

write_verifier_fixture() {
  local file_path="$1"
  local mutation="$2"

  FILE="$file_path" EXPECTED_SHA="$expected_commit_sha" \
    EXPECTED_COMMITTED_AT="$expected_commit_timestamp" MUTATION="$mutation" \
    PRIVATE_MARKER="$verifier_private_marker" node <<'NODE'
const fs = require('node:fs')

const filePath = process.env.FILE
const evidence = {
  schemaVersion: 1,
  status: 'passed',
  startedAt: '2026-09-09T00:00:00.000Z',
  completedAt: '2026-09-09T00:00:01.000Z',
  durationMs: 1000,
  tests: {
    total: 3,
    passed: 3,
    failed: 0,
    skipped: 0,
    todo: 0,
  },
  commit: {
    sha: process.env.EXPECTED_SHA,
    committedAt: process.env.EXPECTED_COMMITTED_AT,
  },
}

if (process.env.MUTATION === 'invalid-json') {
  fs.writeFileSync(filePath, `{"private":"${process.env.PRIVATE_MARKER}"`, {
    encoding: 'utf8',
    mode: 0o600,
  })
} else {
  if (process.env.MUTATION === 'json-shape') {
    evidence.status = 'failed'
    evidence.privateFixture = process.env.PRIVATE_MARKER
  } else if (process.env.MUTATION === 'aggregate-count') {
    evidence.tests.total = 4
    evidence.privateFixture = process.env.PRIVATE_MARKER
  } else if (process.env.MUTATION === 'stale-commit') {
    evidence.commit.sha = '0'.repeat(process.env.EXPECTED_SHA.length)
    evidence.privateFixture = process.env.PRIVATE_MARKER
  } else if (process.env.MUTATION === 'malformed-commit-timestamp') {
    evidence.commit.committedAt = 'not-a-timestamp'
    evidence.privateFixture = process.env.PRIVATE_MARKER
  }
  fs.writeFileSync(filePath, `${JSON.stringify(evidence)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  })
}
fs.chmodSync(filePath, process.env.MUTATION === 'permission' ? 0o640 : 0o600)
NODE
}

run_verifier() {
  local label="$1"
  local resolution="$2"
  local evidence_file="${3:-}"
  local output_file="$verifier_output_dir/$label.log"
  local status=0

  case "$resolution" in
    explicit)
      (
        cd "$repo_root"
        env -u RELEASE_EVIDENCE_DIR -u RELEASE_ID \
          MEDICATION_STOCK_EVIDENCE_FILE="$evidence_file" \
          bash "$verifier" >"$output_file" 2>&1
      ) || status=$?
      ;;
    release)
      (
        cd "$repo_root"
        env -u MEDICATION_STOCK_EVIDENCE_FILE \
          RELEASE_EVIDENCE_DIR="$verifier_release_dir" \
          RELEASE_ID="$verifier_release_id" \
          bash "$verifier" >"$output_file" 2>&1
      ) || status=$?
      ;;
    invalid-release-id)
      (
        cd "$repo_root"
        env -u MEDICATION_STOCK_EVIDENCE_FILE \
          RELEASE_EVIDENCE_DIR="$verifier_release_dir" \
          RELEASE_ID='../invalid-release' \
          bash "$verifier" >"$output_file" 2>&1
      ) || status=$?
      ;;
    *)
      printf 'unknown verifier resolution: %s\n' "$resolution" >&2
      exit 1
      ;;
  esac

  printf '%s %s\n' "$status" "$output_file"
}

assert_verifier_passed() {
  local label="$1"
  local resolution="$2"
  local evidence_file="${3:-}"
  local status
  local output_file

  read -r status output_file < <(run_verifier "$label" "$resolution" "$evidence_file")
  [[ "$status" -eq 0 ]] || {
    printf '%s verifier case unexpectedly failed\n' "$label" >&2
    exit 1
  }
  grep -Fxq 'medication stock release evidence: PASS (tests=3, duration_ms=1000)' \
    "$output_file" || {
    printf '%s verifier case did not report the expected pass summary\n' "$label" >&2
    exit 1
  }
  if grep -Fq "$verifier_private_marker" "$output_file"; then
    printf '%s verifier output exposed private fixture data\n' "$label" >&2
    exit 1
  fi
}

assert_verifier_rejected() {
  local label="$1"
  local mutation="$2"
  local expected_reason="$3"
  local evidence_file="$test_dir/$label.json"
  local status
  local output_file

  write_verifier_fixture "$evidence_file" "$mutation"
  read -r status output_file < <(run_verifier "$label" explicit "$evidence_file")
  [[ "$status" -ne 0 ]] || {
    printf '%s verifier case unexpectedly passed\n' "$label" >&2
    exit 1
  }
  grep -Fxq "medication stock release evidence: FAIL ($expected_reason)" \
    "$output_file" || {
    printf '%s verifier case reported an unexpected failure\n' "$label" >&2
    exit 1
  }
  if grep -Fq "$verifier_private_marker" "$output_file"; then
    printf '%s verifier output exposed private fixture data\n' "$label" >&2
    exit 1
  fi
}

write_verifier_fixture "$test_dir/explicit-evidence.json" valid
assert_verifier_passed explicit-evidence explicit "$test_dir/explicit-evidence.json"

mkdir -p "$(dirname "$verifier_release_file")"
cp "$test_dir/explicit-evidence.json" "$verifier_release_file"
chmod 600 "$verifier_release_file"
assert_verifier_passed release-directory-evidence release

assert_verifier_rejected permission-mode permission 'evidence file must have mode 0600'
assert_verifier_rejected invalid-json invalid-json 'evidence file is not valid JSON'
assert_verifier_rejected json-shape json-shape \
  'evidence is not a passed medication stock acceptance record'
assert_verifier_rejected aggregate-count aggregate-count \
  'evidence aggregate test counts are missing or inconsistent'
assert_verifier_rejected stale-commit stale-commit \
  'evidence commit does not match the checked-out commit'
assert_verifier_rejected malformed-commit-timestamp malformed-commit-timestamp \
  'evidence commit does not match the checked-out commit'

read -r invalid_release_status invalid_release_output < <(
  run_verifier invalid-release-id invalid-release-id
)
[[ "$invalid_release_status" -ne 0 ]] || {
  printf 'invalid release ID unexpectedly passed\n' >&2
  exit 1
}
grep -Fxq 'medication stock release evidence: FAIL (RELEASE_ID contains unsupported characters)' \
  "$invalid_release_output" || {
  printf 'invalid release ID reported an unexpected failure\n' >&2
  exit 1
}
if grep -Fq "$verifier_private_marker" "$invalid_release_output"; then
  printf 'invalid release ID output exposed private fixture data\n' >&2
  exit 1
fi

printf 'Medication stock acceptance wrapper and release evidence regression: PASS\n'
