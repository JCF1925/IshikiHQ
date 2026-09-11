import assert from 'node:assert/strict'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { after, before, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const writer = 'scripts/write-database-acceptance-evidence.sh'
const wrapper = 'scripts/clean-database-acceptance.sh'
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let testRoot = ''

before(async () => {
  testRoot = await mkdtemp(path.join(os.tmpdir(), 'database-acceptance-evidence-'))
})

after(async () => {
  await rm(testRoot, { recursive: true, force: true })
})

describe('database acceptance evidence contract', () => {
  it('writes only allowlisted diagnostic fields and values', async () => {
    for (const category of ['connection', 'migration', 'seed', 'test', 'ownership-check']) {
      const evidenceFile = path.join(testRoot, `${category}.evidence`)
      const result = spawnSync('bash', [writer, evidenceFile, category, 'failed', '17'], {
        encoding: 'utf8',
      })

      assert.equal(result.status, 0, result.stderr)
      assert.equal(
        await readFile(evidenceFile, 'utf8'),
        `category=${category}\nstatus=failed\nexit_code=17\n`,
      )
    }
  })

  it('rejects private or unexpected evidence instead of persisting it', async () => {
    const evidenceFile = path.join(testRoot, 'rejected.evidence')
    const privateMarker = 'legacy-health-claim-payload-private'
    const result = spawnSync(
      'bash',
      [writer, evidenceFile, `test\npayload=${privateMarker}`, 'failed', '1'],
      { encoding: 'utf8' },
    )

    assert.notEqual(result.status, 0)
    await assert.rejects(readFile(evidenceFile, 'utf8'), { code: 'ENOENT' })
    assert.doesNotMatch(result.stderr, new RegExp(privateMarker))
  })

  it('suppresses private output when a database acceptance step fails', async () => {
    const fakeBin = path.join(testRoot, 'failed-step-bin')
    const evidenceFile = path.join(testRoot, 'failed-step.evidence')
    const privateMarkers = [
      'private-health-fixture-name.csv',
      'private-health-fixture-sha256-7f4d9e',
      'private-health-storage-key-claims-42',
      'private-health-audit-row-991',
      'private-health-parser-field-diagnosis',
      'private-health-claim-value-sensitive',
    ]

    await mkdir(fakeBin)
    await writeFile(
      path.join(fakeBin, 'pnpm'),
      `#!/usr/bin/env bash
if [[ "$*" == *"tests/health-claims-import.test.ts"* ]]; then
${privateMarkers.map((marker) => `  printf '%s\\n' '${marker}'`).join('\n')}
${privateMarkers.map((marker) => `  printf '%s\\n' '${marker}' >&2`).join('\n')}
  exit 73
fi
exit 0
`,
    )
    await writeFile(
      path.join(fakeBin, 'psql'),
      `#!/usr/bin/env bash
if [[ "$*" == *"pg_db_role_setting"* ]]; then
  printf 'disposable\\n'
fi
exit 0
`,
    )
    await Promise.all(
      ['pnpm', 'psql'].map((command) => chmod(path.join(fakeBin, command), 0o700)),
    )

    const result = spawnSync('bash', [wrapper], {
      cwd: projectRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        DATABASE_URL: 'postgresql://acceptance.test.invalid/database',
        DATABASE_ACCEPTANCE_TARGET: 'disposable',
        DATABASE_ACCEPTANCE_EVIDENCE_FILE: evidenceFile,
        DATABASE_ACCEPTANCE_FOCUS: 'health-claims',
        PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
      },
    })

    assert.equal(result.status, 1)
    assert.equal(result.signal, null)
    assert.match(result.stderr, /FAILED during account-deletion cleanup database acceptance/)
    const capturedOutput = [
      result.stdout,
      result.stderr,
      result.error?.message ?? '',
      await readFile(evidenceFile, 'utf8'),
    ].join('\n')
    for (const privateMarker of privateMarkers) {
      assert.doesNotMatch(capturedOutput, new RegExp(privateMarker))
    }
    assert.equal(
      await readFile(evidenceFile, 'utf8'),
      'category=test\nstatus=failed\nexit_code=1\n',
    )
  })

  it('writes a separate trend record with only safe release metadata', async () => {
    const evidenceFile = path.join(testRoot, 'trend.evidence')
    const trendFile = path.join(testRoot, 'trend.json')
    const result = spawnSync(
      'bash',
      [writer, evidenceFile, 'ownership-check', 'failed', '23', trendFile],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          GITHUB_WORKFLOW: 'Syntropic validation',
          GITHUB_RUN_ID: '417',
          GITHUB_RUN_ATTEMPT: '2',
          GITHUB_EVENT_NAME: 'workflow_dispatch',
        },
      },
    )

    assert.equal(result.status, 0, result.stderr)
    const trendRecord = JSON.parse(await readFile(trendFile, 'utf8'))
    assert.deepEqual(trendRecord, {
      category: 'ownership-check',
      status: 'failed',
      exit_code: 23,
      workflow: 'Syntropic validation',
      run_id: '417',
      run_attempt: 2,
      event: 'workflow_dispatch',
      recorded_at: trendRecord.recorded_at,
    })
    assert.match(trendRecord.recorded_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
    assert.equal(
      (await readFile(evidenceFile, 'utf8')),
      'category=ownership-check\nstatus=failed\nexit_code=23\n',
    )
  })

  it('rejects unsafe workflow metadata before writing a trend record', async () => {
    const evidenceFile = path.join(testRoot, 'unsafe.evidence')
    const trendFile = path.join(testRoot, 'unsafe.trend.json')
    const result = spawnSync(
      'bash',
      [writer, evidenceFile, 'connection', 'failed', '1', trendFile],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          GITHUB_WORKFLOW: 'workflow\nprivate-command-output',
          GITHUB_RUN_ID: '418',
          GITHUB_RUN_ATTEMPT: '1',
          GITHUB_EVENT_NAME: 'push',
        },
      },
    )

    assert.notEqual(result.status, 0)
    await assert.rejects(readFile(evidenceFile, 'utf8'), { code: 'ENOENT' })
    await assert.rejects(readFile(trendFile, 'utf8'), { code: 'ENOENT' })
    assert.doesNotMatch(result.stderr, /private-command-output/)
  })
})