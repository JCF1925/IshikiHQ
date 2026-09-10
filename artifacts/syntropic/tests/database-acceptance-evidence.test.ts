import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { after, before, describe, it } from 'node:test'

const writer = 'scripts/write-database-acceptance-evidence.sh'
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