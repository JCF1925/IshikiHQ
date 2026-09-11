#!/usr/bin/env bash
set -Eeuo pipefail

fail() {
  printf 'google auth staging release evidence writer: FAIL (%s)\n' "$1" >&2
  exit 1
}

[[ -n "${RELEASE_EVIDENCE_DIR:-}" && -n "${RELEASE_ID:-}" ]] ||
  fail 'RELEASE_EVIDENCE_DIR and RELEASE_ID are required'
[[ "$RELEASE_ID" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] ||
  fail 'RELEASE_ID contains unsupported characters'
[[ "$#" -eq 1 ]] ||
  fail 'exactly one accepted attempt path is required'

release_dir="$(cd -- "$RELEASE_EVIDENCE_DIR/$RELEASE_ID" 2>/dev/null && pwd -P)" ||
  fail 'current release evidence directory is missing or inaccessible'
record_file="${AUTH_REGRESSION_RELEASE_RECORD_FILE:-$release_dir/google-auth-staging-release-record.json}"

RELEASE_DIR="$release_dir" RECORD_FILE="$record_file" ACCEPTED_ATTEMPT_PATH="$1" node <<'NODE'
const fs = require('node:fs')
const crypto = require('node:crypto')
const path = require('node:path')

const releaseDir = process.env.RELEASE_DIR
const recordFile = path.resolve(process.env.RECORD_FILE)
const acceptedInput = process.env.ACCEPTED_ATTEMPT_PATH
const acceptedPath = path.resolve(acceptedInput)
const attemptNamePattern =
  /^google-auth-staging-evidence-attempt-[A-Za-z0-9._-]+-[0-9a-f-]+\.json$/
const errors = []
const statuses = { passed: 0, failed: 0 }

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
const isReleaseAttemptPath = (value) =>
  path.isAbsolute(value)
  && path.dirname(path.resolve(value)) === releaseDir
  && attemptNamePattern.test(path.basename(path.resolve(value)))
const isTimestamp = (value) =>
  typeof value === 'string'
  && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString() === value
const sha256File = (filePath) => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
const isSafeEvidence = (value, label) => {
  if (!exactKeys(value, [
    'callbackObserved',
    'callbackPath',
    'checkedAt',
    'destinationPath',
    'returnedToDestinationPath',
    'stagingOrigin',
  ], label)) return false

  if (!isTimestamp(value.checkedAt)) fail(`${label} timestamp is malformed`)
  if (value.stagingOrigin !== null) {
    if (typeof value.stagingOrigin !== 'string') {
      fail(`${label} origin is malformed`)
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
          fail(`${label} origin is not a public origin`)
        }
      } catch {
        fail(`${label} origin is malformed`)
      }
    }
  }
  if (value.callbackPath !== null && (
    typeof value.callbackPath !== 'string'
    || !/^\/[^?#]*$/.test(value.callbackPath)
  )) {
    fail(`${label} callback path is malformed`)
  }
  if (typeof value.destinationPath !== 'string' || value.destinationPath !== '/') {
    fail(`${label} destination path is malformed`)
  }
  if (typeof value.callbackObserved !== 'boolean') {
    fail(`${label} callback decision is malformed`)
  }
  if (typeof value.returnedToDestinationPath !== 'boolean') {
    fail(`${label} destination decision is malformed`)
  }
  return true
}

if (path.dirname(recordFile) !== releaseDir) {
  fail('release record must be written in the current release directory')
}
if (fs.existsSync(recordFile) && !isRegular0600(recordFile)) {
  fail('existing release record must be a mode-0600 regular file')
}
if (!path.isAbsolute(acceptedInput) || !isReleaseAttemptPath(acceptedPath)) {
  fail('accepted attempt path is outside the current release directory')
}

let retainedAttemptPaths = []
try {
  retainedAttemptPaths = fs.readdirSync(releaseDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && attemptNamePattern.test(entry.name))
    .map((entry) => path.join(releaseDir, entry.name))
    .sort()
} catch {
  fail('current release evidence directory cannot be read')
}

const attempts = []
const attemptDigests = new Set()
for (const [index, attemptPath] of retainedAttemptPaths.entries()) {
  const label = `attempt ${index + 1}`
  if (!isRegular0600(attemptPath)) {
    fail(`${label} evidence file is missing or not mode 0600`)
    continue
  }

  let sha256
  try {
    sha256 = sha256File(attemptPath)
  } catch {
    fail(`${label} evidence file cannot be hashed`)
    continue
  }
  if (attemptDigests.has(sha256)) {
    fail(`${label} content is duplicated at another retained path`)
    continue
  }

  let evidence
  try {
    evidence = JSON.parse(fs.readFileSync(attemptPath, 'utf8'))
  } catch {
    fail(`${label} evidence file is not valid JSON`)
    continue
  }
  if (!isSafeEvidence(evidence, label)) continue

  const status = evidence.callbackObserved && evidence.returnedToDestinationPath
    ? 'passed'
    : 'failed'
  statuses[status] += 1
  attemptDigests.add(sha256)
  attempts.push({ path: attemptPath, status, sha256 })
}

const acceptedEntry = attempts.find((attempt) => attempt.path === acceptedPath)
if (!acceptedEntry) {
  if (!retainedAttemptPaths.includes(acceptedPath)) {
    fail('accepted attempt evidence is missing from the current release directory')
  } else {
    fail('accepted attempt evidence is invalid')
  }
} else if (acceptedEntry.status !== 'passed') {
  fail('accepted attempt status is not passed')
}

if (attempts.length === 0) {
  fail('current release directory contains no valid retained attempts')
}

if (errors.length > 0) {
  process.stderr.write(
    `google auth staging release evidence writer: FAIL (errors=${errors.length}, `
      + `passed=${statuses.passed}, failed=${statuses.failed})\n`,
  )
  process.exit(1)
}

const record = {
  schemaVersion: 2,
  acceptedAttemptPath: acceptedPath,
  acceptedAttemptSha256: acceptedEntry.sha256,
  attempts,
}
const serialized = `${JSON.stringify(record, null, 2)}\n`
let temporaryDirectory = null
try {
  temporaryDirectory = fs.mkdtempSync(path.join(releaseDir, '.google-auth-staging-release-record.'))
  fs.chmodSync(temporaryDirectory, 0o700)
  const temporaryFile = path.join(temporaryDirectory, 'record.json')
  const descriptor = fs.openSync(temporaryFile, 'wx', 0o600)
  try {
    fs.writeFileSync(descriptor, serialized)
    fs.fsyncSync(descriptor)
  } finally {
    fs.closeSync(descriptor)
  }
  fs.chmodSync(temporaryFile, 0o600)
  fs.renameSync(temporaryFile, recordFile)
  fs.chmodSync(recordFile, 0o600)
} catch {
  process.stderr.write('google auth staging release evidence writer: FAIL (atomic record write failed)\n')
  process.exitCode = 1
} finally {
  if (temporaryDirectory) {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true })
  }
}

if (process.exitCode === 1) process.exit(1)
process.stdout.write(
  `google auth staging release evidence writer: PASS (record=${recordFile}, `
    + `accepted=${acceptedPath}, passed=${statuses.passed}, failed=${statuses.failed})\n`,
)
NODE