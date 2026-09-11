#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
verifier="$script_dir/verify-google-auth-staging-evidence.sh"
writer="$script_dir/write-google-auth-staging-evidence.sh"
test_dir="$(mktemp -d "${TMPDIR:-/tmp}/syntropic-google-auth-release-evidence.XXXXXX")"
release_dir="$test_dir/evidence/release-20260909-commit"
record_file="$release_dir/google-auth-staging-release-record.json"
secret_url='https://accounts.google.com/o/oauth2/v2/auth?code=secret-provider-code&token=secret-token'
secret_account='person@example.test'
secret_browser='raw browser output must never be printed'

cleanup() {
  rm -rf "$test_dir"
}
trap cleanup EXIT

mkdir -p "$release_dir"
umask 077

write_clean_attempt() {
  local name="$1"
  local callback_observed="$2"
  local returned_to_destination="$3"
  local file="$release_dir/$name"
  FILE="$file" CALLBACK="$callback_observed" DESTINATION="$returned_to_destination" node <<'NODE'
const fs = require('node:fs')
const evidence = {
  checkedAt: '2026-09-09T00:00:00.000Z',
  stagingOrigin: 'https://staging.example.test',
  callbackPath: '/api/auth/callback/google',
  destinationPath: '/',
  callbackObserved: process.env.CALLBACK === 'true',
  returnedToDestinationPath: process.env.DESTINATION === 'true',
}
fs.writeFileSync(process.env.FILE, `${JSON.stringify(evidence)}\n`, { mode: 0o600 })
fs.chmodSync(process.env.FILE, 0o600)
NODE
}

failed_attempt='google-auth-staging-evidence-attempt-2026-09-09T00-00-00-000Z-deadbeef-dead-beef-dead-beefdeadbeef.json'
passed_attempt='google-auth-staging-evidence-attempt-2026-09-09T00-01-00-000Z-cafebabe-cafe-babe-cafe-babecafebabe.json'
write_clean_attempt "$failed_attempt" false true
write_clean_attempt "$passed_attempt" true true

writer_log="$test_dir/writer.log"
RELEASE_EVIDENCE_DIR="$test_dir/evidence" RELEASE_ID='release-20260909-commit' \
  AUTH_REGRESSION_RELEASE_RECORD_FILE="$record_file" \
  bash "$writer" "$release_dir/$passed_attempt" >"$writer_log"
grep -Fq "accepted=$release_dir/$passed_attempt" "$writer_log"
grep -Fq "passed=1" "$writer_log"
grep -Fq "failed=1" "$writer_log"

pass_log="$test_dir/pass.log"
RELEASE_EVIDENCE_DIR="$test_dir/evidence" RELEASE_ID='release-20260909-commit' \
  AUTH_REGRESSION_RELEASE_RECORD_FILE="$record_file" \
  bash "$verifier" >"$pass_log"
grep -Fq "accepted_status=passed" "$pass_log"
grep -Fq "failed_attempts=1" "$pass_log"
grep -Fq "$passed_attempt" "$pass_log"

assert_rejected() {
  local label="$1"
  local log="$test_dir/$label.log"
  local status=0
  RELEASE_EVIDENCE_DIR="$test_dir/evidence" RELEASE_ID='release-20260909-commit' \
    AUTH_REGRESSION_RELEASE_RECORD_FILE="$record_file" \
    bash "$verifier" >"$log" 2>&1 || status=$?
  [[ "$status" -ne 0 ]] || {
    printf '%s unexpectedly passed\n' "$label" >&2
    cat "$log" >&2
    exit 1
  }
  if grep -Fq "$secret_url" "$log" || grep -Fq "$secret_account" "$log" ||
    grep -Fq "$secret_browser" "$log"; then
    printf '%s exposed private fixture data\n' "$label" >&2
    cat "$log" >&2
    exit 1
  fi
  grep -Eq '^google auth staging release evidence: FAIL \(record=.*errors=[0-9]+, passed=[0-9]+, failed=[0-9]+, unknown=[0-9]+\)$' "$log" ||
    {
      printf '%s did not produce safe aggregate failure output\n' "$label" >&2
      cat "$log" >&2
      exit 1
    }
}

assert_writer_rejected() {
  local label="$1"
  local accepted_path="$2"
  local log="$test_dir/$label-writer.log"
  local status=0
  RELEASE_EVIDENCE_DIR="$test_dir/evidence" RELEASE_ID='release-20260909-commit' \
    AUTH_REGRESSION_RELEASE_RECORD_FILE="$record_file" \
    bash "$writer" "$accepted_path" >"$log" 2>&1 || status=$?
  [[ "$status" -ne 0 ]] || {
    printf '%s writer unexpectedly passed\n' "$label" >&2
    cat "$log" >&2
    exit 1
  }
  if grep -Fq "$secret_url" "$log" || grep -Fq "$secret_account" "$log" ||
    grep -Fq "$secret_browser" "$log"; then
    printf '%s writer exposed private fixture data\n' "$label" >&2
    cat "$log" >&2
    exit 1
  fi
}

update_record() {
  local accepted_path="$1"
  local replace_from="${2:-}"
  local replace_to="${3:-}"
  RECORD="$record_file" ACCEPTED="$accepted_path" REPLACE_FROM="$replace_from" REPLACE_TO="$replace_to" node <<'NODE'
const fs = require('node:fs')
const recordPath = process.env.RECORD
const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'))
record.acceptedAttemptPath = process.env.ACCEPTED
for (const attempt of record.attempts) {
  if (attempt.path === process.env.REPLACE_FROM) attempt.path = process.env.REPLACE_TO
}
fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`)
fs.chmodSync(recordPath, 0o600)
NODE
}

refresh_record() {
  RELEASE_EVIDENCE_DIR="$test_dir/evidence" RELEASE_ID='release-20260909-commit' \
    AUTH_REGRESSION_RELEASE_RECORD_FILE="$record_file" \
    bash "$writer" "$1" >/dev/null
}

accepted_original="$release_dir/$passed_attempt"
chmod 644 "$accepted_original"
assert_rejected "mode-change"
chmod 600 "$accepted_original"

FILE="$accepted_original" node <<'NODE'
const fs = require('node:fs')
const filePath = process.env.FILE
const evidence = JSON.parse(fs.readFileSync(filePath, 'utf8'))
evidence.checkedAt = '2026-09-09T00:00:01.000Z'
fs.writeFileSync(filePath, `${JSON.stringify(evidence)}\n`)
fs.chmodSync(filePath, 0o600)
NODE
assert_rejected "content-change"
write_clean_attempt "$passed_attempt" true true

assert_writer_rejected "failed-accepted" "$release_dir/$failed_attempt"
SECRET_URL="$secret_url" SECRET_ACCOUNT="$secret_account" SECRET_BROWSER="$secret_browser" \
  FILE="$release_dir/$failed_attempt" node <<'NODE'
const fs = require('node:fs')
const filePath = process.env.FILE
const evidence = JSON.parse(fs.readFileSync(filePath, 'utf8'))
evidence.privateFixtureData = {
  providerUrl: process.env.SECRET_URL,
  account: process.env.SECRET_ACCOUNT,
  browserOutput: process.env.SECRET_BROWSER,
}
fs.writeFileSync(filePath, `${JSON.stringify(evidence)}\n`)
fs.chmodSync(filePath, 0o600)
NODE
assert_rejected "unsafe-evidence"
write_clean_attempt "$failed_attempt" false true
refresh_record "$accepted_original"

cp "$accepted_original" "$release_dir/$failed_attempt"
RECORD="$record_file" FAILED="$release_dir/$failed_attempt" node <<'NODE'
const crypto = require('node:crypto')
const fs = require('node:fs')
const recordPath = process.env.RECORD
const failedPath = process.env.FAILED
const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'))
const digest = crypto.createHash('sha256').update(fs.readFileSync(failedPath)).digest('hex')
record.attempts[0].sha256 = digest
fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`)
fs.chmodSync(recordPath, 0o600)
NODE
assert_rejected "duplicate-content"
write_clean_attempt "$failed_attempt" false true
refresh_record "$accepted_original"

RECORD="$record_file" node <<'NODE'
const fs = require('node:fs')
const recordPath = process.env.RECORD
const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'))
record.acceptedAttemptSha256 = '0'.repeat(64)
fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`)
fs.chmodSync(recordPath, 0o600)
NODE
assert_rejected "approved-metadata-mismatch"
refresh_record "$accepted_original"

outside_attempt="$test_dir/google-auth-staging-evidence-attempt-2026-09-09T00-02-00-000Z-feedface-feed-face-feed-facefeedface.json"
cp "$accepted_original" "$outside_attempt"
chmod 600 "$outside_attempt"
assert_writer_rejected "out-of-directory-accepted" "$outside_attempt"
update_record "$outside_attempt" "$accepted_original" "$outside_attempt"
assert_rejected "out-of-directory-accepted"

update_record "$accepted_original" "$outside_attempt" "$accepted_original"

update_record "$release_dir/$failed_attempt"
RECORD="$record_file" FAILED="$release_dir/$failed_attempt" node <<'NODE'
const fs = require('node:fs')
const recordPath = process.env.RECORD
const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'))
for (const attempt of record.attempts) {
  if (attempt.path === process.env.FAILED) attempt.status = 'failed'
}
fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`)
fs.chmodSync(recordPath, 0o600)
NODE
assert_rejected "failed-accepted"

update_record "$accepted_original"
rm "$release_dir/$failed_attempt" "$release_dir/$passed_attempt"
assert_writer_rejected "missing-attempt" "$accepted_original"
assert_rejected "missing-attempt"

printf 'Google staging release evidence privacy and acceptance regression: PASS\n'
