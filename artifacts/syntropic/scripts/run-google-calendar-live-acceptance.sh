#!/usr/bin/env bash
set -Eeuo pipefail

evidence_file="${GOOGLE_CALENDAR_LIVE_ACCEPTANCE_EVIDENCE_FILE:-}"
started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
diagnostic_category="wrapper-failure"
deterministic_tests=false
live_report_file=""
evidence_written=false

write_evidence() {
  [[ -n "$evidence_file" && "$evidence_written" == false ]] || return 0
  EVIDENCE_FILE="$evidence_file" \
  STARTED_AT="$started_at" \
  DETERMINISTIC_TESTS="$deterministic_tests" \
  DIAGNOSTIC_CATEGORY="$diagnostic_category" \
  LIVE_REPORT_FILE="$live_report_file" \
    node 2>/dev/null <<'NODE'
const fs = require('node:fs')
const path = require('node:path')

const checks = {
  guard: false, provider: false, update: false, recurrence: false,
  'melbourne-timezone': false, 'all-day': false, 'etag-conflict': false,
  'cursor-list': false, privacy: false, deletion: false, cleanup: false,
  revoke: 'not-run', disconnect: 'not-run',
}
const checkNames = Object.keys(checks)
let live = null
try {
  if (process.env.LIVE_REPORT_FILE) {
    const lines = fs.readFileSync(process.env.LIVE_REPORT_FILE, 'utf8').trim().split('\n')
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      try {
        const candidate = JSON.parse(lines[index]).googleCalendarLiveAcceptance
        if (candidate) {
          live = candidate
          break
        }
      } catch {}
    }
  }
} catch {}

const diagnosticCategories = live?.diagnosticCategories?.filter(
  value => typeof value === 'string' && /^[a-z-]+$/.test(value),
) ?? [process.env.DIAGNOSTIC_CATEGORY || 'wrapper-failure']
const safeChecks = Object.fromEntries(checkNames.map(name => {
  const value = live?.checks?.[name]
  return [name, value === true || value === false || value === 'not-run' ? value : checks[name]]
}))
const report = {
  googleCalendarLiveAcceptance: {
    outcome: live?.outcome === 'pass' && process.env.DETERMINISTIC_TESTS === 'true' ? 'pass' : 'fail',
    startedAt: live?.startedAt ?? process.env.STARTED_AT,
    completedAt: live?.completedAt ?? new Date().toISOString(),
    checks: safeChecks,
    deterministicTests: process.env.DETERMINISTIC_TESTS === 'true',
    syntheticEventCount: Number.isSafeInteger(live?.syntheticEventCount) ? live.syntheticEventCount : 0,
    revokeRequested: live?.revokeRequested === true,
    diagnosticCategories: live?.outcome === 'pass' && process.env.DETERMINISTIC_TESTS === 'true'
      ? []
      : diagnosticCategories,
  },
}
const destination = process.env.EVIDENCE_FILE
const directory = path.dirname(destination)
const temporary = path.join(directory, `.${path.basename(destination)}.${process.pid}.tmp`)
let fd
try {
  fd = fs.openSync(temporary, 'wx', 0o600)
  fs.writeFileSync(fd, `${JSON.stringify(report, null, 2)}\n`)
  fs.fsyncSync(fd)
  fs.closeSync(fd)
  fd = undefined
  fs.linkSync(temporary, destination)
  fs.unlinkSync(temporary)
} finally {
  if (fd !== undefined) fs.closeSync(fd)
  try { fs.unlinkSync(temporary) } catch {}
}
NODE
  evidence_written=true
}

fail() {
  diagnostic_category="$1"
  write_evidence || printf 'google calendar live acceptance: FAIL (evidence-write)\n' >&2
  printf 'google calendar live acceptance: FAIL (%s)\n' "$1" >&2
  exit 1
}

[[ -n "$evidence_file" ]] || {
  printf 'google calendar live acceptance: FAIL (evidence-destination-required)\n' >&2
  exit 1
}
[[ "$evidence_file" == /* && "$evidence_file" != */../* && "$evidence_file" != *"/../"* ]] ||
  fail 'evidence-destination-rejected'
evidence_directory="$(dirname -- "$evidence_file")"
[[ -d "$evidence_directory" && -w "$evidence_directory" ]] ||
  fail 'evidence-directory-required'
[[ ! -e "$evidence_file" ]] || {
  printf 'google calendar live acceptance: FAIL (evidence-destination-exists)\n' >&2
  exit 1
}

[[ "${GOOGLE_CALENDAR_LIVE_ACCEPTANCE:-}" == "1" ]] ||
  fail 'guard'
[[ "${NODE_ENV:-development}" != "production" ]] ||
  fail 'production-rejected'
[[ "${GOOGLE_CALENDAR_LIVE_ACCEPTANCE_ENVIRONMENT:-}" == "NON_PRODUCTION_DEDICATED" ]] ||
  fail 'dedicated-environment-required'
[[ -n "${GOOGLE_CALENDAR_LIVE_ACCEPTANCE_CONNECTION_ID:-}" ]] ||
  fail 'dedicated-connection-required'
[[ "${GOOGLE_CALENDAR_LIVE_ACCEPTANCE_FINGERPRINT:-}" =~ ^[[:xdigit:]]{64}$ ]] ||
  fail 'dedicated-fingerprint-required'
[[ -n "${DATABASE_URL:-}" ]] || fail 'database-required'
[[ -n "${GOOGLE_CLIENT_ID:-}" && -n "${GOOGLE_CLIENT_SECRET:-}" ]] ||
  fail 'google-credentials-required'

# These deterministic tests are authoritative for provider retries and privacy
# predicates. Database-backed Calendar worker coverage stays in
# scripts/clean-database-acceptance.sh so it always uses a disposable migrated
# schema rather than the shared development database.
test_output="$(mktemp)"
live_report_file="$(mktemp)"
trap 'rm -f "$test_output" "$live_report_file"' EXIT
if ! pnpm exec tsx --test --experimental-test-module-mocks \
  tests/calendar-core.test.ts \
  tests/calendar-oauth-flow.test.ts \
  tests/calendar-provider.test.ts \
  tests/automation-beta.test.ts >"$test_output" 2>&1; then
  fail 'deterministic-tests'
fi
deterministic_tests=true

if ! pnpm exec tsx scripts/google-calendar-live-acceptance.ts >"$live_report_file" 2>&1; then
  diagnostic_category='live-acceptance'
  write_evidence || fail 'evidence-write'
  printf 'google calendar live acceptance: FAIL (live-acceptance)\n' >&2
  exit 1
fi
write_evidence || fail 'evidence-write'
printf 'google calendar live acceptance: PASS (evidence: %s)\n' "$evidence_file"