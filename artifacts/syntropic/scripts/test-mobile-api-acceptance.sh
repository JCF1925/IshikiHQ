#!/usr/bin/env bash
set -Eeuo pipefail

# Shell-level contract test for run-mobile-api-acceptance.sh. The external
# database, migration, and API test commands are replaced so this verifies the
# evidence boundary without connecting to PostgreSQL.

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
wrapper="$script_dir/run-mobile-api-acceptance.sh"
test_dir="$(mktemp -d "${TMPDIR:-/tmp}/syntropic-mobile-api-wrapper.XXXXXX")"
fake_bin="$test_dir/bin"
call_log="$test_dir/calls.log"
wrapper_tmp_dir="$test_dir/tmp"
database_url='postgresql://acceptance-user:super-secret@shared.example:5432/syntropic_shared?sslmode=require'
private_identifier='mobile-user-test-identifier-42'
private_payload='{"healthKitUuid":"private-health-payload"}'
raw_failure_output='RAW_MOBILE_ACCEPTANCE_OUTPUT_SHOULD_NOT_BE_RETAINED'
mkdir -p "$fake_bin" "$wrapper_tmp_dir"
touch "$call_log"

cleanup() {
  rm -rf "$test_dir"
}
trap cleanup EXIT INT TERM

cat >"$fake_bin/psql" <<'FAKE_PSQL'
#!/usr/bin/env bash
set -Eeuo pipefail
printf 'psql %s\n' "$*" >>"${MOBILE_API_WRAPPER_CALL_LOG:?}"
if [[ "$*" == *"pg_db_role_setting"* ]]; then
  printf '%s\n' "${MOBILE_API_WRAPPER_DATABASE_TARGET:-}"
fi
FAKE_PSQL

cat >"$fake_bin/prisma" <<'FAKE_PRISMA'
#!/usr/bin/env bash
set -Eeuo pipefail
printf 'prisma %s\n' "$*" >>"${MOBILE_API_WRAPPER_CALL_LOG:?}"
FAKE_PRISMA

cat >"$fake_bin/pnpm" <<'FAKE_PNPM'
#!/usr/bin/env bash
set -Eeuo pipefail
printf 'pnpm %s\n' "$*" >>"${MOBILE_API_WRAPPER_CALL_LOG:?}"
if [[ "${MOBILE_API_WRAPPER_TEST_MODE:-pass}" == "fail" ]]; then
  printf 'acceptance failure: %s %s %s\n' \
    "${MOBILE_API_WRAPPER_PRIVATE_IDENTIFIER:?}" \
    "${MOBILE_API_WRAPPER_PRIVATE_PAYLOAD:?}" \
    "${MOBILE_API_WRAPPER_RAW_FAILURE_OUTPUT:?}" >&2
  exit 23
fi
FAKE_PNPM

chmod +x "$fake_bin/psql" "$fake_bin/prisma" "$fake_bin/pnpm"

run_wrapper() {
  local label="$1"
  local mode="$2"
  local database_target="${3-disposable}"
  local evidence_file="$test_dir/$label.evidence"
  local output_file="$test_dir/$label.log"
  local status=0

  : >"$call_log"
  (
    cd "$test_dir"
    env \
      PATH="$fake_bin:$PATH" \
      TMPDIR="$wrapper_tmp_dir" \
      DATABASE_URL="$database_url" \
      DATABASE_ACCEPTANCE_TARGET=disposable \
      DATABASE_ACCEPTANCE_EVIDENCE_FILE="$evidence_file" \
      MOBILE_API_WRAPPER_CALL_LOG="$call_log" \
      MOBILE_API_WRAPPER_DATABASE_TARGET="$database_target" \
      MOBILE_API_WRAPPER_TEST_MODE="$mode" \
      MOBILE_API_WRAPPER_PRIVATE_IDENTIFIER="$private_identifier" \
      MOBILE_API_WRAPPER_PRIVATE_PAYLOAD="$private_payload" \
      MOBILE_API_WRAPPER_RAW_FAILURE_OUTPUT="$raw_failure_output" \
      bash "$wrapper" >"$output_file" 2>&1
  ) || status=$?

  if find "$wrapper_tmp_dir" -maxdepth 1 -type f -name 'syntropic-mobile-api.*.log' -print -quit |
    grep -q .; then
    printf '%s retained its temporary acceptance log\n' "$label" >&2
    exit 1
  fi

  printf '%s %s %s\n' "$status" "$evidence_file" "$output_file"
}

assert_evidence() {
  local evidence_file="$1"
  local expected_category="$2"
  local expected_status="$3"
  local expected_exit_code="$4"
  local output_file="$5"

  [[ -f "$evidence_file" ]] ||
    { printf 'mobile API evidence was not written\n' >&2; exit 1; }
  [[ ! -L "$evidence_file" ]] ||
    { printf 'mobile API evidence must not be a symlink\n' >&2; exit 1; }
  [[ "$(stat -c '%a' "$evidence_file")" == "600" ]] ||
    { printf 'mobile API evidence did not have mode 0600\n' >&2; exit 1; }
  [[ "$(stat -c '%a' "$(dirname "$evidence_file")")" == "700" ]] ||
    { printf 'mobile API evidence directory did not have mode 0700\n' >&2; exit 1; }
  [[ "$(cat "$evidence_file")" == \
"category=$expected_category
status=$expected_status
exit_code=$expected_exit_code" ]] ||
    { printf 'mobile API evidence did not match the shared contract\n' >&2; exit 1; }

  if grep -Fq "$database_url" "$evidence_file" ||
    grep -Fq "$private_identifier" "$evidence_file" ||
    grep -Fq "$private_payload" "$evidence_file" ||
    grep -Fq "$raw_failure_output" "$evidence_file" ||
    grep -Fq "$database_url" "$output_file" ||
    grep -Fq "$private_identifier" "$output_file" ||
    grep -Fq "$private_payload" "$output_file" ||
    grep -Fq "$raw_failure_output" "$output_file"; then
    printf 'mobile API acceptance exposed private values\n' >&2
    exit 1
  fi
}

read -r pass_status pass_evidence pass_output < <(run_wrapper passed pass disposable)
[[ "$pass_status" -eq 0 ]] ||
  { printf 'passing mobile API acceptance unexpectedly failed\n' >&2; exit 1; }
[[ "$(grep -c '^psql ' "$call_log")" -eq 3 ]] ||
  { printf 'passing mobile API acceptance did not verify, create, and clean up its schema\n' >&2; exit 1; }
assert_evidence "$pass_evidence" none passed 0 "$pass_output"

read -r failed_status failed_evidence failed_output < <(run_wrapper failed fail disposable)
[[ "$failed_status" -eq 23 ]] ||
  { printf 'failed mobile API acceptance returned %s instead of 23\n' "$failed_status" >&2; exit 1; }
[[ "$(grep -c '^psql ' "$call_log")" -eq 3 ]] ||
  { printf 'failed mobile API acceptance did not verify, create, and clean up its schema\n' >&2; exit 1; }
assert_evidence "$failed_evidence" test failed 23 "$failed_output"

for database_target in "" shared-development; do
  label="rejected-${database_target:-missing}"
  read -r rejected_status rejected_evidence rejected_output < <(
    run_wrapper "$label" pass "$database_target"
  )
  [[ "$rejected_status" -ne 0 ]] ||
    { printf '%s mobile API acceptance unexpectedly passed\n' "$label" >&2; exit 1; }
  [[ "$(grep -c '^psql ' "$call_log")" -eq 1 ]] ||
    { printf '%s mobile API acceptance ran before target rejection\n' "$label" >&2; exit 1; }
  assert_evidence "$rejected_evidence" connection failed "$rejected_status" "$rejected_output"
done

printf 'Mobile API database acceptance evidence privacy regression: PASS\n'