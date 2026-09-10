import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  assertGoogleAuthStagingEvidence,
  type GoogleAuthStagingEvidence,
  writeGoogleAuthStagingEvidence,
} from './google-auth-staging-evidence'

const validEvidence: GoogleAuthStagingEvidence = {
  checkedAt: '2026-09-08T00:00:00.000Z',
  stagingOrigin: 'https://staging.example.test',
  callbackPath: '/api/auth/callback/google',
  destinationPath: '/',
  callbackObserved: true,
  returnedToDestinationPath: true,
}

test('writes only the allowlisted staging sign-in evidence without credentials', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'google-auth-evidence-'))
  const fileNameTemplate = path.join(directory, 'evidence.json')
  try {
    const firstFile = await writeGoogleAuthStagingEvidence(fileNameTemplate, validEvidence)
    const secondFile = await writeGoogleAuthStagingEvidence(fileNameTemplate, validEvidence)
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

test('rejects unexpected evidence fields and private failure details', () => {
  for (const unsafe of [
    { ...validEvidence, status: 'failed' },
    { ...validEvidence, provider: { name: 'google', account: 'person@example.test' } },
    { ...validEvidence, token: 'secret-token' },
    { ...validEvidence, error: new Error('raw provider failure') },
  ]) {
    assert.throws(() => assertGoogleAuthStagingEvidence(unsafe), /unexpected fields/)
  }
})

test('rejects provider queries, account details, and raw details hidden in allowed fields', () => {
  for (const unsafe of [
    { ...validEvidence, stagingOrigin: 'https://person:password@staging.example.test' },
    { ...validEvidence, stagingOrigin: 'https://staging.example.test?provider=google&token=secret' },
    { ...validEvidence, callbackPath: '/api/auth/callback/google?code=secret&account=person' },
    { ...validEvidence, destinationPath: '/?error=raw-provider-failure' },
  ]) {
    assert.throws(() => assertGoogleAuthStagingEvidence(unsafe))
  }
})