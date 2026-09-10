import assert from 'node:assert/strict'
import { chmod, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

const packageRoot = process.cwd()
const verificationScript = path.join(packageRoot, 'scripts/verify-production-ops.sh')

const sensitiveConfiguration = {
  DATABASE_URL: 'postgresql://fixture-user:fixture-password@fixture.invalid:5432/fixture',
  OPS_ALERT_WEBHOOK_URL: 'https://fixture-webhook.invalid/secret-path',
  OPS_ALERT_OWNER: 'fixture-owner-sensitive-value',
}

type EvidenceKind = 'restore' | 'alert'
type EvidenceOverrides = Record<string, string | undefined>

const validEvidence = {
  OPS_EVIDENCE_CHECK_DATE: '2026-09-09',
  OPS_RESTORE_EVIDENCE_DATE: '2026-09-09',
  OPS_RESTORE_EVIDENCE_STATUS: 'pass',
  OPS_RESTORE_EVIDENCE_ROLE: 'database-operator',
  OPS_ALERT_EVIDENCE_DATE: '2026-09-09',
  OPS_ALERT_EVIDENCE_STATUS: 'pass',
  OPS_ALERT_EVIDENCE_ROLE: 'incident-commander',
}

function evidenceField(kind: EvidenceKind, field: 'DATE' | 'STATUS' | 'ROLE') {
  return `OPS_${kind === 'restore' ? 'RESTORE' : 'ALERT'}_EVIDENCE_${field}`
}

function runVerification(
  backupDirectory: string,
  overrides: EvidenceOverrides = {},
  environmentOverrides: Record<string, string | undefined> = {},
) {
  const environment: Record<string, string | undefined> = {
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    LANG: 'C',
    NODE_ENV: 'test',
    OPS_ENVIRONMENT: 'production',
    ...sensitiveConfiguration,
    BACKUP_DIR: backupDirectory,
    BACKUP_ENCRYPTION_MODE: 'managed_kms',
    BACKUP_IMMUTABLE: 'true',
    BACKUP_DAILY_RETENTION_DAYS: '35',
    BACKUP_MONTHLY_RETENTION_MONTHS: '12',
    BACKUP_SCHEDULE: '0 2 * * *',
    OPS_RESTORE_DRILL_SCHEDULE: 'quarterly',
    OPS_EVIDENCE_REMINDER_SCHEDULE: 'daily',
    OPS_ALERT_ENVIRONMENT: 'production',
    OPS_ALERT_ACK_WINDOW_MINUTES: '15',
    OPS_ALERT_POLL_FAILURE_THRESHOLD: '3',
    OPS_ALERT_QUEUE_AGE_SECONDS: '300',
    ...validEvidence,
    ...overrides,
    ...environmentOverrides,
  }

  for (const [key, value] of Object.entries(environment)) {
    if (value === undefined) delete environment[key]
  }

  const result = spawnSync('bash', [verificationScript], {
    cwd: packageRoot,
    encoding: 'utf8',
    env: environment as NodeJS.ProcessEnv,
  })
  assert.equal(result.error, undefined, result.error?.message)

  const output = `${result.stdout}\n${result.stderr}`
  for (const value of Object.values(sensitiveConfiguration)) {
    assert.equal(output.includes(value), false, `sensitive configuration value was printed: ${value}`)
  }

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  }
}

test('production operations verification reports an incompatible date utility before release checks', async () => {
  const testDirectory = await mkdtemp(path.join(os.tmpdir(), 'syntropic-production-ops-date-'))
  const backupDirectory = path.join(testDirectory, 'backup-destination')
  const incompatibleDate = path.join(testDirectory, 'date')
  await mkdir(backupDirectory)
  await writeFile(incompatibleDate, '#!/usr/bin/env bash\nexit 42\n', 'utf8')
  await chmod(incompatibleDate, 0o755)

  try {
    const result = runVerification(backupDirectory, {}, {
      PATH: `${testDirectory}:${process.env.PATH ?? '/usr/bin:/bin'}`,
    })

    assert.notEqual(result.status, 0)
    assert.match(
      result.stderr,
      /date utility preflight failed: date must support UTC parsing with -u -d and ISO formatting with \+%F/,
    )
    assert.doesNotMatch(result.stderr, /OPS_ENVIRONMENT must be production/)
    assert.doesNotMatch(result.stderr, /DATABASE_URL is required/)
  } finally {
    await rm(testDirectory, { recursive: true, force: true })
  }
})

test('production operations verification fails closed at every evidence freshness boundary', async (t) => {
  const testDirectory = await mkdtemp(path.join(os.tmpdir(), 'syntropic-production-ops-'))
  const backupDirectory = path.join(testDirectory, 'backup-destination')
  await mkdir(backupDirectory)

  try {
    const current = runVerification(backupDirectory)
    assert.equal(current.status, 0)
    assert.match(current.stdout, /no secrets were printed/)
    assert.doesNotMatch(current.stderr, /WARNING: .*evidence expires/)

    const warningWindow = runVerification(backupDirectory, {
      OPS_RESTORE_EVIDENCE_DATE: '2026-06-25',
      OPS_ALERT_EVIDENCE_DATE: '2026-06-25',
    })
    assert.equal(warningWindow.status, 0)
    assert.match(warningWindow.stderr, /Quarterly restore evidence expires in 14 day\(s\)/)
    assert.match(warningWindow.stderr, /Alert acknowledgement evidence expires in 14 day\(s\)/)
    assert.match(warningWindow.stderr, /renew it before the quarterly deadline/)

    const scenarios: Array<{
      name: string
      overrides: Partial<Record<'DATE' | 'STATUS' | 'ROLE', string | undefined>>
      guidance: RegExp
    }> = [
      {
        name: 'missing evidence',
        overrides: {
          DATE: undefined,
          STATUS: undefined,
          ROLE: undefined,
        },
        guidance: /record its date, pass\/fail status, and named operational role/,
      },
      {
        name: 'exact-deadline evidence',
        overrides: { DATE: '2026-06-11' },
        guidance: /complete a new quarterly check and record a passing result before release/,
      },
      {
        name: 'overdue evidence',
        overrides: { DATE: '2026-06-10' },
        guidance: /complete a new quarterly check and record a passing result before release/,
      },
      {
        name: 'future-dated evidence',
        overrides: { DATE: '2026-09-10' },
        guidance: /evidence date cannot be in the future/,
      },
      {
        name: 'malformed evidence date',
        overrides: { DATE: '2026-02-30' },
        guidance: /evidence date must be a valid UTC date/,
      },
      {
        name: 'non-pass evidence status',
        overrides: { STATUS: 'fail' },
        guidance: /evidence is not marked pass; remediate it before release/,
      },
      {
        name: 'carriage-return evidence role',
        overrides: { ROLE: 'named-role\runexpected-value' },
        guidance: /evidence role must be a single named operational role/,
      },
      {
        name: 'newline evidence role',
        overrides: { ROLE: 'named-role\nunexpected-value' },
        guidance: /evidence role must be a single named operational role/,
      },
    ]

    for (const kind of ['restore', 'alert'] as const) {
      for (const scenario of scenarios) {
        await t.test(`${scenario.name} ${kind} evidence`, () => {
          const overrides: EvidenceOverrides = {}
          for (const field of ['DATE', 'STATUS', 'ROLE'] as const) {
            const value = scenario.overrides[field]
            if (scenario.name === 'missing evidence') {
              overrides[evidenceField(kind, field)] = undefined
            } else if (value !== undefined) {
              overrides[evidenceField(kind, field)] = value
            }
          }

          const result = runVerification(backupDirectory, overrides)
          assert.notEqual(result.status, 0)
          assert.match(result.stderr, scenario.guidance)
          assert.equal(result.stdout, '', `${scenario.name} ${kind} evidence printed success output`)
        })
      }
    }
  } finally {
    await rm(testDirectory, { recursive: true, force: true })
  }
})
