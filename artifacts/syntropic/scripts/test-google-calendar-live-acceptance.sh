#!/usr/bin/env bash
set -Eeuo pipefail

# Shell-level contract test for run-google-calendar-live-acceptance.sh. The
# deterministic test suite and live acceptance process are replaced with a
# credential-free command shim so the evidence and console boundaries can be
# tested without Google credentials or a database.

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
wrapper="$script_dir/run-google-calendar-live-acceptance.sh"
test_dir="$(mktemp -d "${TMPDIR:-/tmp}/syntropic-calendar-wrapper.XXXXXX")"
fake_bin="$test_dir/bin"
wrapper_tmp_dir="$test_dir/tmp"
canary_token='calendar-access-token-canary'
canary_identifier='calendar-account-identifier-canary'
canary_content='Calendar private event content canary'
canary_error='raw Calendar provider error canary'
mkdir -p "$fake_bin" "$wrapper_tmp_dir"

cleanup() {
  rm -rf "$test_dir"
}
trap cleanup EXIT INT TERM

cat >"$fake_bin/pnpm" <<'FAKE_PNPM'
#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "$*" == *"tests/calendar-core.test.ts"* ]]; then
  if [[ "${GOOGLE_CALENDAR_WRAPPER_TEST_MODE:-}" == "deterministic-failure" ]]; then
    printf 'deterministic output: %s %s\n' \
      "${GOOGLE_CALENDAR_WRAPPER_TOKEN_CANARY:?}" \
      "${GOOGLE_CALENDAR_WRAPPER_IDENTIFIER_CANARY:?}" >&2
    printf 'deterministic failure: %s\n' "${GOOGLE_CALENDAR_WRAPPER_ERROR_CANARY:?}"
    exit 19
  fi
  printf 'deterministic success: %s\n' "${GOOGLE_CALENDAR_WRAPPER_CONTENT_CANARY:?}"
  exit 0
fi

if [[ "$*" == *"scripts/google-calendar-live-acceptance.ts"* ]]; then
  printf 'live command output: %s %s %s %s\n' \
    "${GOOGLE_CALENDAR_WRAPPER_TOKEN_CANARY:?}" \
    "${GOOGLE_CALENDAR_WRAPPER_IDENTIFIER_CANARY:?}" \
    "${GOOGLE_CALENDAR_WRAPPER_CONTENT_CANARY:?}" \
    "${GOOGLE_CALENDAR_WRAPPER_ERROR_CANARY:?}" >&2
  if [[ "${GOOGLE_CALENDAR_WRAPPER_TEST_MODE:-}" == "live-failure" ]]; then
    printf '%s\n' '{"googleCalendarLiveAcceptance":{"outcome":"fail","startedAt":"2026-09-10T00:00:00.000Z","completedAt":"2026-09-10T00:01:00.000Z","checks":{"provider":"unsafe-provider-detail","unexpected":"unsafe-check"},"deterministicTests":true,"syntheticEventCount":999,"revokeRequested":true,"diagnosticCategories":["provider-failure"],"rawError":"'"${GOOGLE_CALENDAR_WRAPPER_ERROR_CANARY}"'"}}'
    exit 23
  fi
  printf '%s\n' '{"googleCalendarLiveAcceptance":{"outcome":"pass","startedAt":"2026-09-10T00:00:00.000Z","completedAt":"2026-09-10T00:01:00.000Z","checks":{"guard":true,"provider":true,"update":true,"recurrence":true,"melbourne-timezone":true,"all-day":true,"etag-conflict":true,"cursor-list":true,"privacy":true,"deletion":true,"cleanup":true,"revoke":true,"disconnect":true},"deterministicTests":true,"syntheticEventCount":2,"revokeRequested":false,"diagnosticCategories":[]}}'
  exit 0
fi

printf 'unexpected command: %s\n' "$*" >&2
exit 64
FAKE_PNPM
chmod +x "$fake_bin/pnpm"

assert_no_canaries() {
  local file="$1"
  for canary in "$canary_token" "$canary_identifier" "$canary_content" "$canary_error"; do
    if grep -Fq "$canary" "$file"; then
      printf 'Calendar wrapper leaked a canary into %s\n' "$file" >&2
      exit 1
    fi
  done
}

assert_report() {
  local evidence_file="$1"
  local expected_category="$2"
  local expected_outcome="$3"
  local expected_deterministic="$4"
  local expected_event_count="$5"
  local expected_revoke="$6"
  local expected_check_state="$7"
  local output_file="$8"
  EVIDENCE_FILE="$evidence_file" \
  EXPECTED_CATEGORY="$expected_category" \
  EXPECTED_OUTCOME="$expected_outcome" \
  EXPECTED_DETERMINISTIC="$expected_deterministic" \
  EXPECTED_EVENT_COUNT="$expected_event_count" \
  EXPECTED_REVOKE="$expected_revoke" \
  EXPECTED_CHECK_STATE="$expected_check_state" \
  CANARY_TOKEN="$canary_token" \
  CANARY_IDENTIFIER="$canary_identifier" \
  CANARY_CONTENT="$canary_content" \
  CANARY_ERROR="$canary_error" \
    node <<'NODE'
const assert = require('node:assert/strict')
const fs = require('node:fs')

const fileStat = fs.lstatSync(process.env.EVIDENCE_FILE)
assert.equal(fileStat.isSymbolicLink(), false)
assert.equal(fileStat.mode & 0o777, 0o600)
const evidence = JSON.parse(fs.readFileSync(process.env.EVIDENCE_FILE, 'utf8'))
assert.deepEqual(Object.keys(evidence), ['googleCalendarLiveAcceptance'])
const report = evidence.googleCalendarLiveAcceptance
assert.deepEqual(Object.keys(report).sort(), [
  'checks',
  'completedAt',
  'deterministicTests',
  'diagnosticCategories',
  'outcome',
  'revokeRequested',
  'startedAt',
  'syntheticEventCount',
].sort())
for (const timestamp of [report.startedAt, report.completedAt]) {
  assert.match(timestamp, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/)
  assert.equal(new Date(timestamp).toISOString().startsWith(timestamp.slice(0, 19)), true)
}
assert.equal(report.outcome, process.env.EXPECTED_OUTCOME)
assert.equal(report.deterministicTests, process.env.EXPECTED_DETERMINISTIC === 'true')
assert.equal(report.syntheticEventCount, Number(process.env.EXPECTED_EVENT_COUNT))
assert.equal(report.revokeRequested, process.env.EXPECTED_REVOKE === 'true')
assert.deepEqual(Object.keys(report.checks).sort(), [
  'all-day',
  'cleanup',
  'cursor-list',
  'deletion',
  'disconnect',
  'etag-conflict',
  'guard',
  'melbourne-timezone',
  'privacy',
  'provider',
  'recurrence',
  'revoke',
  'update',
].sort())
const expectedState = process.env.EXPECTED_CHECK_STATE
for (const [name, value] of Object.entries(report.checks)) {
  assert.equal(value, expectedState === 'true' ? true : (
    name === 'revoke' || name === 'disconnect' ? 'not-run' : false
  ))
}
assert.deepEqual(
  report.diagnosticCategories,
  process.env.EXPECTED_CATEGORY ? [process.env.EXPECTED_CATEGORY] : [],
)

const serialized = JSON.stringify(evidence)
for (const canary of [
  process.env.CANARY_TOKEN,
  process.env.CANARY_IDENTIFIER,
  process.env.CANARY_CONTENT,
  process.env.CANARY_ERROR,
]) {
  assert.equal(serialized.includes(canary), false, `evidence retained canary: ${canary}`)
}
NODE
  assert_no_canaries "$evidence_file"
  assert_no_canaries "$output_file"
}

run_wrapper() {
  local label="$1"
  local mode="$2"
  local evidence_file="$test_dir/$label.evidence"
  local output_file="$test_dir/$label.log"
  local status=0

  (
    cd "$test_dir"
    env \
      PATH="$fake_bin:$PATH" \
      TMPDIR="$wrapper_tmp_dir" \
      GOOGLE_CALENDAR_LIVE_ACCEPTANCE_EVIDENCE_FILE="$evidence_file" \
      GOOGLE_CALENDAR_LIVE_ACCEPTANCE="${GOOGLE_CALENDAR_WRAPPER_OPT_IN:-}" \
      GOOGLE_CALENDAR_LIVE_ACCEPTANCE_ENVIRONMENT=NON_PRODUCTION_DEDICATED \
      GOOGLE_CALENDAR_LIVE_ACCEPTANCE_CONNECTION_ID="$canary_identifier" \
      GOOGLE_CALENDAR_LIVE_ACCEPTANCE_FINGERPRINT="$(printf 'a%.0s' {1..64})" \
      DATABASE_URL="postgresql://user:password@database.example.test/private" \
      GOOGLE_CLIENT_ID="$canary_identifier.apps.googleusercontent.test" \
      GOOGLE_CLIENT_SECRET="$canary_token" \
      GOOGLE_CALENDAR_WRAPPER_TEST_MODE="$mode" \
      GOOGLE_CALENDAR_WRAPPER_TOKEN_CANARY="$canary_token" \
      GOOGLE_CALENDAR_WRAPPER_IDENTIFIER_CANARY="$canary_identifier" \
      GOOGLE_CALENDAR_WRAPPER_CONTENT_CANARY="$canary_content" \
      GOOGLE_CALENDAR_WRAPPER_ERROR_CANARY="$canary_error" \
      bash "$wrapper" >"$output_file" 2>&1
  ) || status=$?

  printf '%s %s %s\n' "$status" "$evidence_file" "$output_file"
}

# Missing opt-in guard: the wrapper must still emit a bounded failure report.
read -r guard_status guard_evidence guard_output < <(
  GOOGLE_CALENDAR_WRAPPER_OPT_IN= run_wrapper missing-guard deterministic-failure
)
[[ "$guard_status" -eq 1 ]] ||
  { printf 'missing Calendar guard returned %s instead of 1\n' "$guard_status" >&2; exit 1; }
assert_report "$guard_evidence" guard fail false 0 false false "$guard_output"

# Deterministic failure: captured test output must not become console or evidence.
read -r deterministic_status deterministic_evidence deterministic_output < <(
  GOOGLE_CALENDAR_WRAPPER_OPT_IN=1 run_wrapper deterministic-failure deterministic-failure
)
[[ "$deterministic_status" -eq 1 ]] ||
  { printf 'deterministic Calendar failure returned %s instead of 1\n' "$deterministic_status" >&2; exit 1; }
assert_report "$deterministic_evidence" deterministic-tests fail false 0 false false "$deterministic_output"

# Live failure: a malformed/private field in the command report is ignored.
read -r live_status live_evidence live_output < <(
  GOOGLE_CALENDAR_WRAPPER_OPT_IN=1 run_wrapper live-failure live-failure
)
[[ "$live_status" -eq 1 ]] ||
  { printf 'live Calendar failure returned %s instead of 1\n' "$live_status" >&2; exit 1; }
assert_report "$live_evidence" provider-failure fail true 999 true false "$live_output"

# Safe success: only the fixed allowlist may be retained, including not-run
# values for checks that are not exercised when revocation is disabled.
read -r pass_status pass_evidence pass_output < <(
  GOOGLE_CALENDAR_WRAPPER_OPT_IN=1 run_wrapper safe-success pass
)
[[ "$pass_status" -eq 0 ]] ||
  { printf 'safe Calendar success returned %s instead of 0\n' "$pass_status" >&2; exit 1; }
assert_report "$pass_evidence" '' pass true 2 false true "$pass_output"

# An existing destination must be left byte-for-byte unchanged. This also
# proves the wrapper's link-based commit cannot overwrite prior evidence.
existing_evidence="$test_dir/existing.evidence"
existing_output="$test_dir/existing.log"
existing_contents='prior evidence must remain unchanged'
printf '%s\n' "$existing_contents" >"$existing_evidence"
chmod 600 "$existing_evidence"
existing_status=0
(
  cd "$test_dir"
  env \
    PATH="$fake_bin:$PATH" \
    TMPDIR="$wrapper_tmp_dir" \
    GOOGLE_CALENDAR_LIVE_ACCEPTANCE_EVIDENCE_FILE="$existing_evidence" \
    GOOGLE_CALENDAR_LIVE_ACCEPTANCE=1 \
    GOOGLE_CALENDAR_LIVE_ACCEPTANCE_ENVIRONMENT=NON_PRODUCTION_DEDICATED \
    GOOGLE_CALENDAR_LIVE_ACCEPTANCE_CONNECTION_ID="$canary_identifier" \
    GOOGLE_CALENDAR_LIVE_ACCEPTANCE_FINGERPRINT="$(printf 'a%.0s' {1..64})" \
    DATABASE_URL="postgresql://user:password@database.example.test/private" \
    GOOGLE_CLIENT_ID="$canary_identifier.apps.googleusercontent.test" \
    GOOGLE_CLIENT_SECRET="$canary_token" \
    bash "$wrapper" >"$existing_output" 2>&1
) || existing_status=$?
[[ "$existing_status" -eq 1 ]] ||
  { printf 'existing Calendar evidence destination returned %s instead of 1\n' "$existing_status" >&2; exit 1; }
[[ "$(cat "$existing_evidence")" == "$existing_contents" ]] ||
  { printf 'existing Calendar evidence was overwritten\n' >&2; exit 1; }
assert_no_canaries "$existing_evidence"
assert_no_canaries "$existing_output"
[[ "$(find "$test_dir" -maxdepth 1 -name '.existing.evidence.*.tmp' -print -quit)" == "" ]] ||
  { printf 'existing Calendar evidence left a temporary file\n' >&2; exit 1; }

printf 'Google Calendar live acceptance evidence privacy regression: PASS\n'