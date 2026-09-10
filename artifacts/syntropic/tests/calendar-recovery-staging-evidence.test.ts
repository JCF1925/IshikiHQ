import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  assertCalendarRecoveryStagingEvidence,
  calendarRecoveryExpectedDiagnostics,
  calendarRecoveryStagingChecks,
  captureCalendarRecoveryDiagnostics,
  type CalendarRecoveryStagingEvidence,
  writeCalendarRecoveryStagingEvidence,
} from './calendar-recovery-staging-evidence'

const validEvidence: CalendarRecoveryStagingEvidence = {
  checkedAt: '2026-09-09T00:00:00.000Z',
  stagingOrigin: 'https://staging.example.test',
  checks: Object.fromEntries(calendarRecoveryStagingChecks.map((check) => [check, true])) as Record<
    (typeof calendarRecoveryStagingChecks)[number],
    boolean
  >,
  expectedDiagnostics: [...calendarRecoveryExpectedDiagnostics],
  diagnosticLogConfirmation: {
    observedDiagnostics: [...calendarRecoveryExpectedDiagnostics],
    allExpectedDiagnosticsObserved: true,
  },
  allPassed: true,
}

test('captures only expected Calendar diagnostics from server output', () => {
  const output = [
    "Calendar route failure { route: 'list-calendars', errorClass: 'CalendarProviderError' }",
    'Calendar route failure {"route":"list-calendars","errorClass":"ApplicationError"}',
    'Calendar route failure { route: \'sync-now\', errorClass: \'CalendarProviderError\' }',
    'Calendar route failure {"route":"sync-now","errorClass":"ApplicationError"}',
    'Calendar route failure { route: \'sync-now\', errorClass: \'UnknownError\', message: \'refresh_token=secret\' }',
    'provider response https://accounts.google.com/o/oauth2/auth?access_token=secret',
  ].join('\n')

  assert.deepEqual(captureCalendarRecoveryDiagnostics(output), calendarRecoveryExpectedDiagnostics)
  assert.doesNotMatch(
    JSON.stringify(captureCalendarRecoveryDiagnostics(output)),
    /secret|accounts\.google\.com|refresh_token|access_token/i,
  )
})

test('writes only allowlisted Calendar recovery evidence without identifiers or payloads', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'calendar-recovery-evidence-'))
  const fileNameTemplate = path.join(directory, 'evidence.json')
  try {
    const firstFile = await writeCalendarRecoveryStagingEvidence(fileNameTemplate, validEvidence)
    const secondFile = await writeCalendarRecoveryStagingEvidence(fileNameTemplate, validEvidence)
    assert.notEqual(firstFile, secondFile)
    assert.match(path.basename(firstFile), /^evidence-attempt-[\dTZ-]+-[0-9a-f-]+\.json$/)
    assert.deepEqual(JSON.parse(await readFile(firstFile, 'utf8')), validEvidence)
    assert.deepEqual(JSON.parse(await readFile(secondFile, 'utf8')), validEvidence)
    assert.equal((await stat(firstFile)).mode & 0o777, 0o600)
    assert.equal((await stat(secondFile)).mode & 0o777, 0o600)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('rejects unexpected Calendar recovery evidence fields and provider details', () => {
  for (const unsafe of [
    { ...validEvidence, connectionId: 'calendar-connection' },
    { ...validEvidence, provider: { account: 'person@example.test' } },
    { ...validEvidence, error: 'access_token=secret' },
    { ...validEvidence, expectedDiagnostics: [{ route: 'sync-now', errorClass: 'raw provider failure' }] },
    {
      ...validEvidence,
      diagnosticLogConfirmation: {
        observedDiagnostics: [{
          route: 'sync-now',
          errorClass: 'ApplicationError',
          rawError: 'refresh_token=secret',
        }],
        allExpectedDiagnosticsObserved: false,
      },
    },
  ]) {
    assert.throws(() => assertCalendarRecoveryStagingEvidence(unsafe), /unexpected|deep-equal|expected/i)
  }
})

test('rejects provider queries and account details in the staging origin', () => {
  for (const unsafe of [
    { ...validEvidence, stagingOrigin: 'https://person:password@staging.example.test' },
    { ...validEvidence, stagingOrigin: 'https://staging.example.test?token=secret' },
  ]) {
    assert.throws(() => assertCalendarRecoveryStagingEvidence(unsafe))
  }
})