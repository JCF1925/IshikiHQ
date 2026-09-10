import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { chmod, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

export type GoogleAuthStagingEvidence = {
  checkedAt: string
  stagingOrigin: string | null
  callbackPath: string | null
  destinationPath: '/'
  callbackObserved: boolean
  returnedToDestinationPath: boolean
}

const evidenceKeys = [
  'callbackObserved',
  'callbackPath',
  'checkedAt',
  'destinationPath',
  'returnedToDestinationPath',
  'stagingOrigin',
] as const

export function assertGoogleAuthStagingEvidence(
  value: unknown,
): asserts value is GoogleAuthStagingEvidence {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'evidence must be an object')
  const evidence = value as Record<string, unknown>
  assert.deepEqual(Object.keys(evidence).sort(), [...evidenceKeys], 'evidence contains unexpected fields')

  assert.equal(typeof evidence.checkedAt, 'string', 'checkedAt must be a UTC timestamp')
  assert.equal(
    new Date(evidence.checkedAt as string).toISOString(),
    evidence.checkedAt,
    'checkedAt must be an ISO UTC timestamp',
  )

  if (evidence.stagingOrigin !== null) {
    assert.equal(typeof evidence.stagingOrigin, 'string', 'stagingOrigin must be an origin or null')
    const origin = new URL(evidence.stagingOrigin as string)
    assert.equal(origin.protocol, 'https:', 'stagingOrigin must use HTTPS')
    assert.equal(origin.username, '', 'stagingOrigin must not contain account details')
    assert.equal(origin.password, '', 'stagingOrigin must not contain account details')
    assert.equal(origin.pathname, '/', 'stagingOrigin must not contain a path')
    assert.equal(origin.search, '', 'stagingOrigin must not contain a provider query string')
    assert.equal(origin.hash, '', 'stagingOrigin must not contain a fragment')
    assert.equal(origin.origin, evidence.stagingOrigin, 'stagingOrigin must contain only the origin')
  }

  for (const key of ['callbackPath', 'destinationPath'] as const) {
    const pathValue = evidence[key]
    if (key === 'callbackPath' && pathValue === null) continue
    assert.equal(typeof pathValue, 'string', `${key} must be a path${key === 'callbackPath' ? ' or null' : ''}`)
    assert.match(pathValue as string, /^\/[^?#]*$/, `${key} must not contain a query string or fragment`)
  }
  assert.equal(evidence.destinationPath, '/', 'destinationPath must be the dashboard root')

  assert.equal(typeof evidence.callbackObserved, 'boolean', 'callbackObserved must be boolean')
  assert.equal(
    typeof evidence.returnedToDestinationPath,
    'boolean',
    'returnedToDestinationPath must be boolean',
  )
}

export async function writeGoogleAuthStagingEvidence(
  fileNameTemplate: string,
  evidence: GoogleAuthStagingEvidence,
) {
  assertGoogleAuthStagingEvidence(evidence)
  const configuredPath = path.resolve(process.cwd(), fileNameTemplate)
  const extension = path.extname(configuredPath)
  const basename = path.basename(configuredPath, extension)
  const attemptTimestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filePath = path.join(
    path.dirname(configuredPath),
    `${basename}-attempt-${attemptTimestamp}-${randomUUID()}${extension || '.json'}`,
  )
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(evidence, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  })
  await chmod(filePath, 0o600)
  return filePath
}