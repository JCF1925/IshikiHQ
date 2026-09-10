#!/usr/bin/env bash
set -Eeuo pipefail

fail() {
  printf 'google auth staging release evidence: FAIL (%s)\n' "$1" >&2
  exit 1
}

[[ -n "${RELEASE_EVIDENCE_DIR:-}" && -n "${RELEASE_ID:-}" ]] ||
  fail 'RELEASE_EVIDENCE_DIR and RELEASE_ID are required'
[[ "$RELEASE_ID" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] ||
  fail 'RELEASE_ID contains unsupported characters'

release_dir="$(cd -- "$RELEASE_EVIDENCE_DIR/$RELEASE_ID" 2>/dev/null && pwd -P)" ||
  fail 'current release evidence directory is missing or inaccessible'
record_file="${AUTH_REGRESSION_RELEASE_RECORD_FILE:-$release_dir/google-auth-staging-release-record.json}"

RELEASE_DIR="$release_dir" RECORD_FILE="$record_file" node <<'NODE'
const fs = require('node:fs')
const path = require('node:path')

const releaseDir = process.env.RELEASE_DIR
const recordFile = path.resolve(process.env.RECORD_FILE)
const errors = []
const statuses = { passed: 0, failed: 0, unknown: 0 }
let acceptedPath = null
let acceptedStatus = null

const fail = (reason) => errors.push(reason)
const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const exactKeys = (value, keys, label) => {
  if (!isPlainObject(value)) {
    fail(`${label} must be an object`)
    return false
  }
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(`${label} contains unexpected fields`)
    return false
  }
  return true
}
const isRegular0600 = (filePath) => {
  try {
    const fileStat = fs.lstatSync(filePath)
    return fileStat.isFile() && !fileStat.isSymbolicLink() && (fileStat.mode & 0o777) === 0o600
  } catch {
    return false
  }
}
const isReleaseAttemptPath = (value) => {
  if (typeof value !== 'string' || !path.isAbsolute(value)) return false
  const resolved = path.resolve(value)
  return path.dirname(resolved) === releaseDir
    && /^google-auth-staging-evidence-attempt-[A-Za-z0-9._-]+-[0-9a-f-]+\.json$/.test(path.basename(resolved))
}
const isTimestamp = (value) =>
  typeof value === 'string'
  && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString() === value
const isSafeEvidence = (value) => {
  if (!exactKeys(value, [
    'callbackObserved',
    'callbackPath',
    'checkedAt',
    'destinationPath',
    'returnedToDestinationPath',
    'stagingOrigin',
  ], 'attempt evidence')) return false

  if (!isTimestamp(value.checkedAt)) {
    fail('attempt evidence timestamp is malformed')
  }
  if (value.stagingOrigin !== null) {
    if (typeof value.stagingOrigin !== 'string') {
      fail('attempt evidence origin is malformed')
    } else {
      try {
        const origin = new URL(value.stagingOrigin)
        if (
          origin.protocol !== 'https:'
          || origin.username
          || origin.password
          || origin.pathname !== '/'
          || origin.search
          || origin.hash
          || origin.origin !== value.stagingOrigin
        ) {
          fail('attempt evidence origin is not a public origin')
        }
      } catch {
        fail('attempt evidence origin is malformed')
      }
    }
  }
  if (value.callbackPath !== null && (
    typeof value.callbackPath !== 'string'
    || !/^\/[^?#]*$/.test(value.callbackPath)
  )) {
    fail('attempt evidence callback path is malformed')
  }
  if (value.destinationPath !== '/' || typeof value.destinationPath !== 'string') {
    fail('attempt evidence destination path is malformed')
  }
  if (typeof value.callbackObserved !== 'boolean') {
    fail('attempt evidence callback decision is malformed')
  }
  if (typeof value.returnedToDestinationPath !== 'boolean') {
    fail('attempt evidence destination decision is malformed')
  }
  return true
}

if (path.dirname(recordFile) !== releaseDir || !isRegular0600(recordFile)) {
  fail('release record must be a mode-0600 regular file in the current release directory')
}

let record = null
try {
  record = JSON.parse(fs.readFileSync(recordFile, 'utf8'))
} catch {
  fail('release record is not valid JSON')
}

let attempts = []
if (exactKeys(record, ['acceptedAttemptPath', 'attempts', 'schemaVersion'], 'release record')) {
  if (record.schemaVersion !== 1) fail('release record schema version is unsupported')
  if (!Array.isArray(record.attempts) || record.attempts.length === 0) {
    fail('release record must list at least one attempt')
  } else {
    attempts = record.attempts
  }
  if (typeof record.acceptedAttemptPath !== 'string') {
    fail('release record accepted attempt path is missing')
  } else {
    acceptedPath = path.resolve(record.acceptedAttemptPath)
  }
}

const attemptPaths = new Set()
for (const [index, attempt] of attempts.entries()) {
  const label = `attempt ${index + 1}`
  if (!exactKeys(attempt, ['path', 'status'], label)) continue
  if (!isReleaseAttemptPath(attempt.path)) {
    fail(`${label} path is outside the current release directory`)
    continue
  }
  const attemptPath = path.resolve(attempt.path)
  if (attemptPaths.has(attemptPath)) {
    fail(`${label} path is duplicated`)
    continue
  }
  attemptPaths.add(attemptPath)
  if (attempt.status !== 'passed' && attempt.status !== 'failed') {
    statuses.unknown += 1
    fail(`${label} status is not passed or failed`)
    continue
  }
  statuses[attempt.status] += 1
  if (!isRegular0600(attemptPath)) {
    fail(`${label} evidence file is missing or not mode 0600`)
    continue
  }

  let evidence
  try {
    evidence = JSON.parse(fs.readFileSync(attemptPath, 'utf8'))
  } catch {
    fail(`${label} evidence file is not valid JSON`)
    continue
  }
  const validEvidence = isSafeEvidence(evidence)
  if (!validEvidence) continue
  const derivedStatus = evidence.callbackObserved && evidence.returnedToDestinationPath
    ? 'passed'
    : 'failed'
  if (attempt.status !== derivedStatus) {
    fail(`${label} status does not match its redacted assertions`)
  }
}

if (acceptedPath === null || !isReleaseAttemptPath(acceptedPath)) {
  fail('accepted attempt path is outside the current release directory')
} else {
  const acceptedEntry = attempts.find((attempt) => (
    isPlainObject(attempt) && attempt.path === acceptedPath
  ))
  if (!acceptedEntry) {
    fail('accepted attempt is not listed in the release record')
  } else {
    acceptedStatus = acceptedEntry.status
    if (acceptedStatus !== 'passed') {
      fail('accepted attempt status is not passed')
    }
  }
  if (!attemptPaths.has(acceptedPath)) {
    fail('accepted attempt evidence is missing from the retained attempts')
  }
}

let retainedAttemptNames = []
try {
  retainedAttemptNames = fs.readdirSync(releaseDir, { withFileTypes: true })
    .filter((entry) => (
      entry.isFile()
      && /^google-auth-staging-evidence-attempt-[A-Za-z0-9._-]+-[0-9a-f-]+\.json$/.test(entry.name)
    ))
    .map((entry) => path.join(releaseDir, entry.name))
} catch {
  fail('current release evidence directory cannot be read')
}
for (const retainedPath of retainedAttemptNames) {
  if (!attemptPaths.has(retainedPath)) {
    fail('a retained staging attempt is missing from the release record')
  }
}

if (errors.length > 0) {
  process.stderr.write(
    `google auth staging release evidence: FAIL (record=${recordFile}, errors=${errors.length}, `
      + `passed=${statuses.passed}, failed=${statuses.failed}, unknown=${statuses.unknown})\n`,
  )
  process.exit(1)
}

process.stdout.write(
  `google auth staging release evidence: PASS (record=${recordFile}, `
    + `accepted=${acceptedPath}, accepted_status=${acceptedStatus}, attempts=${attempts.length}, `
    + `failed_attempts=${statuses.failed})\n`,
)
NODE