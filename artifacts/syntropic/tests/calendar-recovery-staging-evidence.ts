import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { chmod, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const calendarRecoveryStagingChecks = [
  'listCalendarsProvider',
  'listCalendarsApplication',
  'syncNowProvider',
  'syncNowApplication',
] as const

export const calendarRecoveryExpectedDiagnostics = [
  { route: 'list-calendars', errorClass: 'CalendarProviderError' },
  { route: 'list-calendars', errorClass: 'ApplicationError' },
  { route: 'sync-now', errorClass: 'CalendarProviderError' },
  { route: 'sync-now', errorClass: 'ApplicationError' },
] as const

export type CalendarRecoveryDiagnostic = (typeof calendarRecoveryExpectedDiagnostics)[number]

export type CalendarRecoveryDiagnosticLogConfirmation = {
  observedDiagnostics: CalendarRecoveryDiagnostic[]
  allExpectedDiagnosticsObserved: boolean
}

export type CalendarRecoveryStagingEvidence = {
  checkedAt: string
  stagingOrigin: string | null
  checks: Record<(typeof calendarRecoveryStagingChecks)[number], boolean>
  expectedDiagnostics: CalendarRecoveryDiagnostic[]
  diagnosticLogConfirmation: CalendarRecoveryDiagnosticLogConfirmation
  allPassed: boolean
}

const evidenceKeys = [
  'allPassed',
  'checkedAt',
  'checks',
  'diagnosticLogConfirmation',
  'expectedDiagnostics',
  'stagingOrigin',
] as const

const diagnosticLogLine = /^\s*(?:.*?\s)?Calendar route failure\s+\{([^}\n]*)\}\s*$/
const routeValue = /(?:^|[,{\s])['"]?route['"]?\s*:\s*['"](list-calendars|sync-now)['"]/
const errorClassValue = /(?:^|[,{\s])['"]?errorClass['"]?\s*:\s*['"](CalendarProviderError|ApplicationError)['"]/

function isExpectedDiagnostic(value: unknown): value is CalendarRecoveryDiagnostic {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== 'errorClass,route'
  ) return false
  return calendarRecoveryExpectedDiagnostics.some((expected) => (
    expected.route === (value as CalendarRecoveryDiagnostic)?.route
    && expected.errorClass === (value as CalendarRecoveryDiagnostic)?.errorClass
  ))
}

/**
 * Extract only the route and error class pair emitted by logCalendarFailure.
 * The input is deliberately never returned or retained, so provider messages,
 * account identifiers, OAuth values, URLs, and headers cannot enter evidence.
 */
export function captureCalendarRecoveryDiagnostics(serverOutput: string): CalendarRecoveryDiagnostic[] {
  const captured: CalendarRecoveryDiagnostic[] = []
  for (const line of serverOutput.split(/\r?\n/)) {
    const match = line.match(diagnosticLogLine)
    if (!match) continue
    const route = line.match(routeValue)?.[1]
    const errorClass = line.match(errorClassValue)?.[1]
    const diagnostic = { route, errorClass }
    if (isExpectedDiagnostic(diagnostic)) {
      captured.push(diagnostic)
    }
  }
  return captured
}

export function assertCalendarRecoveryStagingEvidence(
  value: unknown,
): asserts value is CalendarRecoveryStagingEvidence {
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
    assert.equal(origin.search, '', 'stagingOrigin must not contain a query string')
    assert.equal(origin.hash, '', 'stagingOrigin must not contain a fragment')
    assert.equal(origin.origin, evidence.stagingOrigin, 'stagingOrigin must contain only the origin')
  }

  assert.ok(evidence.checks && typeof evidence.checks === 'object' && !Array.isArray(evidence.checks))
  assert.deepEqual(
    Object.keys(evidence.checks as object).sort(),
    [...calendarRecoveryStagingChecks].sort(),
    'checks contains unexpected fields',
  )
  for (const check of calendarRecoveryStagingChecks) {
    assert.equal(typeof (evidence.checks as Record<string, unknown>)[check], 'boolean', `${check} must be boolean`)
  }

  assert.deepEqual(evidence.expectedDiagnostics, calendarRecoveryExpectedDiagnostics)
  assert.ok(
    evidence.diagnosticLogConfirmation
      && typeof evidence.diagnosticLogConfirmation === 'object'
      && !Array.isArray(evidence.diagnosticLogConfirmation),
  )
  const confirmation = evidence.diagnosticLogConfirmation as Record<string, unknown>
  assert.deepEqual(
    Object.keys(confirmation).sort(),
    ['allExpectedDiagnosticsObserved', 'observedDiagnostics'],
    'diagnosticLogConfirmation contains unexpected fields',
  )
  assert.ok(Array.isArray(confirmation.observedDiagnostics), 'observedDiagnostics must be an array')
  for (const diagnostic of confirmation.observedDiagnostics) {
    assert.ok(isExpectedDiagnostic(diagnostic), 'observedDiagnostics must contain only expected diagnostics')
  }
  assert.deepEqual(
    confirmation.observedDiagnostics,
    calendarRecoveryExpectedDiagnostics.filter((expected) => (
      (confirmation.observedDiagnostics as CalendarRecoveryDiagnostic[]).some((observed) => (
        observed.route === expected.route && observed.errorClass === expected.errorClass
      ))
    )),
    'observedDiagnostics must contain unique expected diagnostics in expected order',
  )
  assert.equal(
    typeof confirmation.allExpectedDiagnosticsObserved,
    'boolean',
    'allExpectedDiagnosticsObserved must be boolean',
  )
  assert.equal(
    confirmation.allExpectedDiagnosticsObserved,
    JSON.stringify(confirmation.observedDiagnostics) === JSON.stringify(calendarRecoveryExpectedDiagnostics),
    'allExpectedDiagnosticsObserved must match the observed diagnostics',
  )
  assert.equal(typeof evidence.allPassed, 'boolean', 'allPassed must be boolean')
  assert.equal(
    evidence.allPassed,
    Object.values(evidence.checks as Record<string, boolean>).every(Boolean)
      && confirmation.allExpectedDiagnosticsObserved,
    'allPassed must match the individual checks',
  )
}

export async function writeCalendarRecoveryStagingEvidence(
  fileNameTemplate: string,
  evidence: CalendarRecoveryStagingEvidence,
) {
  assertCalendarRecoveryStagingEvidence(evidence)
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