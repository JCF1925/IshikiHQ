#!/usr/bin/env bash
set -Eeuo pipefail

fail() {
  printf 'medication stock release evidence: FAIL (%s)\n' "$1" >&2
  exit 1
}

evidence_file="${MEDICATION_STOCK_EVIDENCE_FILE:-}"
if [[ -z "$evidence_file" ]]; then
  if [[ -n "${RELEASE_EVIDENCE_DIR:-}" || -n "${RELEASE_ID:-}" ]]; then
    [[ -n "${RELEASE_EVIDENCE_DIR:-}" && -n "${RELEASE_ID:-}" ]] ||
      fail 'RELEASE_EVIDENCE_DIR and RELEASE_ID must be set together'
    [[ "$RELEASE_ID" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] ||
      fail 'RELEASE_ID contains unsupported characters'
    evidence_file="$RELEASE_EVIDENCE_DIR/$RELEASE_ID/medication-stock-acceptance-evidence.json"
  else
    fail 'MEDICATION_STOCK_EVIDENCE_FILE or RELEASE_EVIDENCE_DIR and RELEASE_ID is required'
  fi
fi

[[ -f "$evidence_file" && ! -L "$evidence_file" ]] ||
  fail 'evidence file is missing or is not a regular file'
[[ "$(stat -c '%a' "$evidence_file" 2>/dev/null)" == "600" ]] ||
  fail 'evidence file must have mode 0600'

expected_commit_sha="$(git rev-parse --verify HEAD 2>/dev/null)" ||
  fail 'checked-out commit SHA is unavailable'
[[ "$expected_commit_sha" =~ ^[[:xdigit:]]+$ ]] ||
  fail 'checked-out commit SHA is malformed'

EVIDENCE_FILE="$evidence_file" EXPECTED_COMMIT_SHA="$expected_commit_sha" node <<'NODE'
const fs = require('node:fs')

const fail = (reason) => {
  process.stderr.write(`medication stock release evidence: FAIL (${reason})\n`)
  process.exit(1)
}

let evidence
try {
  evidence = JSON.parse(fs.readFileSync(process.env.EVIDENCE_FILE, 'utf8'))
} catch {
  fail('evidence file is not valid JSON')
}

const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0
const isTimestamp = (value) =>
  isNonEmptyString(value) && Number.isFinite(Date.parse(value))
const isCount = (value) =>
  Number.isSafeInteger(value) && value >= 0

if (
  evidence === null ||
  typeof evidence !== 'object' ||
  Array.isArray(evidence) ||
  evidence.schemaVersion !== 1 ||
  evidence.status !== 'passed'
) {
  fail('evidence is not a passed medication stock acceptance record')
}

if (!isTimestamp(evidence.startedAt) || !isTimestamp(evidence.completedAt)) {
  fail('evidence timestamps are missing or malformed')
}

if (!Number.isSafeInteger(evidence.durationMs) || evidence.durationMs <= 0) {
  fail('evidence duration is missing or malformed')
}

const tests = evidence.tests
if (
  tests === null ||
  typeof tests !== 'object' ||
  Array.isArray(tests) ||
  !isCount(tests.total) ||
  !isCount(tests.passed) ||
  !isCount(tests.failed) ||
  !isCount(tests.skipped) ||
  !isCount(tests.todo) ||
  tests.total !== tests.passed + tests.failed + tests.skipped + tests.todo ||
  tests.total === 0 ||
  tests.passed === 0 ||
  tests.failed !== 0
) {
  fail('evidence aggregate test counts are missing or inconsistent')
}

const commit = evidence.commit
if (
  commit === null ||
  typeof commit !== 'object' ||
  Array.isArray(commit) ||
  commit.sha !== process.env.EXPECTED_COMMIT_SHA ||
  !isTimestamp(commit.committedAt)
) {
  fail('evidence commit does not match the checked-out commit')
}

process.stdout.write(
  `medication stock release evidence: PASS (tests=${tests.total}, duration_ms=${evidence.durationMs})\n`,
)
NODE