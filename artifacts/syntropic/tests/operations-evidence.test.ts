import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { spawn, spawnSync } from 'node:child_process'
import https from 'node:https'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import {
  assessOperationsEvidence,
  EVIDENCE_REMINDER_CADENCE_DAYS,
  formatUtcDate,
  parseUtcDate,
} from '../lib/operations-evidence.ts'
import {
  buildOperationsAlert,
  getOperationsAlertConfig,
} from '../lib/operations-alerting.ts'

const config = getOperationsAlertConfig({
  OPS_ALERT_OWNER: 'operations@example.test',
  OPS_ALERT_ENVIRONMENT: 'production',
  OPS_ALERT_WEBHOOK_URL: 'https://alerts.example.test/receiver',
})


const restoreEvidence = {
  evidenceType: 'quarterly_restore' as const,
  evidenceDate: '2026-01-01',
  status: 'pass' as const,
  operationalRole: 'database-operator',
}

const reminderEnvironment = {
  OPS_ENVIRONMENT: 'production',
  OPS_ALERT_ENVIRONMENT: 'production',
  OPS_ALERT_OWNER: 'operations@example.test',
  OPS_EVIDENCE_CHECK_DATE: '2026-03-18',
  OPS_RESTORE_EVIDENCE_DATE: '2026-01-01',
  OPS_RESTORE_EVIDENCE_STATUS: 'pass',
  OPS_RESTORE_EVIDENCE_ROLE: 'database-operator',
  OPS_ALERT_EVIDENCE_DATE: '2026-01-01',
  OPS_ALERT_EVIDENCE_STATUS: 'pass',
  OPS_ALERT_EVIDENCE_ROLE: 'incident-commander',
}

type ReceiverPayload = {
  alertType: string
  details: Record<string, string | number | boolean>
  owner: string
  summary: string
  [key: string]: unknown
}

function listenForReceiver(server: https.Server) {
  return new Promise<number>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject)
      resolve((server.address() as AddressInfo).port)
    })
  })
}

function closeReceiver(server: https.Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
}

function runReminder(environment: Record<string, string | undefined>) {
  const child = spawn('pnpm', ['run', 'ops:remind-evidence'], {
    cwd: path.resolve(process.cwd()),
    env: Object.fromEntries(
      Object.entries({ ...process.env, ...environment })
        .filter((entry): entry is [string, string] => entry[1] !== undefined),
    ),
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  return new Promise<{
    status: number | null
    stdout: string
    stderr: string
  }>((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    child.once('error', reject)
    child.once('close', (status) => resolve({ status, stdout, stderr }))
  })
}

describe('operations evidence reminders', () => {
  it('calculates the 90-day deadline and reminds at the first cadence point', () => {
    const assessment = assessOperationsEvidence(restoreEvidence, '2026-03-18')

    assert.equal(assessment.dueDate, '2026-04-01')
    assert.equal(assessment.daysRemaining, 14)
    assert.equal(assessment.shouldRemind, true)
    assert.equal(assessment.isReleaseBlocker, false)
  })

  it('uses bounded cadence points instead of reminding on every daily run', () => {
    assert.deepEqual(EVIDENCE_REMINDER_CADENCE_DAYS, [14, 7, 1])
    assert.equal(assessOperationsEvidence(restoreEvidence, '2026-03-19').daysRemaining, 13)
    assert.equal(assessOperationsEvidence(restoreEvidence, '2026-03-19').shouldRemind, false)
    assert.equal(assessOperationsEvidence(restoreEvidence, '2026-03-25').daysRemaining, 7)
    assert.equal(assessOperationsEvidence(restoreEvidence, '2026-03-25').shouldRemind, true)
    assert.equal(assessOperationsEvidence(restoreEvidence, '2026-03-26').daysRemaining, 6)
    assert.equal(assessOperationsEvidence(restoreEvidence, '2026-03-26').shouldRemind, false)
    assert.equal(assessOperationsEvidence(restoreEvidence, '2026-03-31').daysRemaining, 1)
    assert.equal(assessOperationsEvidence(restoreEvidence, '2026-03-31').shouldRemind, true)
  })

  it('does not remind current evidence before the cadence window', () => {
    const assessment = assessOperationsEvidence(restoreEvidence, '2026-03-17')

    assert.equal(assessment.daysRemaining, 15)
    assert.equal(assessment.shouldRemind, false)
    assert.equal(assessment.isReleaseBlocker, false)
  })

  it('keeps failed, future-dated, and overdue evidence as blockers', () => {
    assert.equal(
      assessOperationsEvidence(
        { ...restoreEvidence, status: 'fail' },
        '2026-03-18',
      ).isReleaseBlocker,
      true,
    )
    assert.equal(
      assessOperationsEvidence(restoreEvidence, '2025-12-31').blockerReason,
      'quarterly_restore evidence date cannot be in the future',
    )
    assert.equal(
      assessOperationsEvidence(restoreEvidence, '2026-04-01').blockerReason,
      'quarterly_restore evidence is overdue; complete a new quarterly check before release',
    )
    assert.equal(assessOperationsEvidence(restoreEvidence, '2026-04-01').shouldRemind, false)
  })

  it('validates and formats calendar dates without local timezone drift', () => {
    assert.equal(formatUtcDate(parseUtcDate('2028-02-29', 'date')), '2028-02-29')
    assert.throws(() => parseUtcDate('2028-02-30', 'date'), /valid UTC date/)
  })
})

describe('evidence reminder payloads', () => {
  it('allows only the evidence type, due date, status, and role details', () => {
    const payload = buildOperationsAlert(
      'evidence_expiry',
      'Quarterly restore evidence is due within the 14-day reminder window.',
      config,
      undefined,
      {
        evidenceType: 'quarterly_restore',
        dueDate: '2026-04-01',
        status: 'pass',
        operationalRole: 'database-operator',
        productionUrl: 'https://production.example.test',
        credential: 'secret',
        providerPayload: 'private',
      },
    )

    assert.deepEqual(Object.keys(payload.details).sort(), [
      'dueDate',
      'evidenceType',
      'operationalRole',
      'status',
    ])
    assert.equal(payload.worker, null)
    assert.equal(JSON.stringify(payload).includes('production.example.test'), false)
    assert.equal(JSON.stringify(payload).includes('secret'), false)
    assert.equal(JSON.stringify(payload).includes('private'), false)
  })
})

describe('scheduled evidence reminder command', () => {
  it('delivers one privacy-safe reminder to each configured operational role', async () => {
    const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'syntropic-ops-receiver-'))
    const keyPath = path.join(temporaryDirectory, 'receiver-key.pem')
    const certificatePath = path.join(temporaryDirectory, 'receiver-cert.pem')
    const certificate = spawnSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-keyout',
        keyPath,
        '-out',
        certificatePath,
        '-days',
        '1',
        '-nodes',
        '-subj',
        '/CN=localhost',
      ],
      { encoding: 'utf8' },
    )
    assert.equal(certificate.status, 0, certificate.stderr)

    const payloads: ReceiverPayload[] = []
    const receiver = https.createServer(
      {
        key: await readFile(keyPath),
        cert: await readFile(certificatePath),
      },
      (request, response) => {
        const chunks: Buffer[] = []
        request.on('data', (chunk: Buffer) => chunks.push(chunk))
        request.on('end', () => {
          try {
            payloads.push(JSON.parse(Buffer.concat(chunks).toString()) as ReceiverPayload)
            response.writeHead(204).end()
          } catch {
            response.writeHead(400).end()
          }
        })
      },
    )

    try {
      const port = await listenForReceiver(receiver)
      const receiverUrl = `https://127.0.0.1:${port}/receiver`
      const result = await runReminder({
        ...reminderEnvironment,
        OPS_ALERT_WEBHOOK_URL: receiverUrl,
        NODE_TLS_REJECT_UNAUTHORIZED: '0',
      })

      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
      assert.match(result.stdout, /Sent 2 privacy-safe quarterly evidence reminder\(s\)/)
      assert.equal(payloads.length, 2)

      const byRole = new Map(
        payloads.map((payload) => [payload.details.operationalRole, payload]),
      )
      assert.deepEqual([...byRole.keys()].sort(), [
        'database-operator',
        'incident-commander',
      ])
      for (const [role, payload] of byRole) {
        assert.equal(payload.alertType, 'evidence_expiry')
        assert.equal(payload.owner, 'operations@example.test')
        assert.equal(payload.details.operationalRole, role)
        assert.deepEqual(Object.keys(payload.details).sort(), [
          'dueDate',
          'evidenceType',
          'operationalRole',
          'status',
        ])
        assert.equal(JSON.stringify(payload).includes(receiverUrl), false)
        assert.equal(JSON.stringify(payload).includes('receiver-key.pem'), false)
      }
    } finally {
      await closeReceiver(receiver)
      await rm(temporaryDirectory, { recursive: true, force: true })
    }
  })

  it('keeps missing, failed, future-dated, and overdue records as blockers', async () => {
    const scenarios: Array<{
      name: string
      overrides: Partial<Record<'DATE' | 'STATUS' | 'ROLE', string | undefined>>
      message: (evidenceType: string, variablePrefix: string) => RegExp
    }> = [
      {
        name: 'missing',
        overrides: {
          DATE: undefined,
          STATUS: undefined,
          ROLE: undefined,
        },
        message: (_evidenceType, variablePrefix) => (
          new RegExp(`OPS_${variablePrefix}_EVIDENCE_DATE is required`)
        ),
      },
      {
        name: 'failed',
        overrides: { STATUS: 'fail' },
        message: (evidenceType) => (
          new RegExp(`${evidenceType} evidence is not marked pass`)
        ),
      },
      {
        name: 'future-dated',
        overrides: { DATE: '2026-03-19' },
        message: (evidenceType) => (
          new RegExp(`${evidenceType} evidence date cannot be in the future`)
        ),
      },
      {
        name: 'overdue',
        overrides: { DATE: '2025-12-01' },
        message: (evidenceType) => (
          new RegExp(`${evidenceType} evidence is overdue`)
        ),
      },
    ]

    for (const [evidenceType, variablePrefix] of [
      ['quarterly_restore', 'RESTORE'],
      ['alert_acknowledgement', 'ALERT'],
    ] as const) {
      for (const scenario of scenarios) {
        const overrides = Object.fromEntries(
          Object.entries(scenario.overrides).map(([field, value]) => [
            `OPS_${variablePrefix}_EVIDENCE_${field}`,
            value,
          ]),
        )
        const result = await runReminder({
          ...reminderEnvironment,
          OPS_ALERT_WEBHOOK_URL: 'https://receiver.invalid/receiver',
          ...overrides,
        })
        assert.notEqual(result.status, 0, `${evidenceType} ${scenario.name}`)
        assert.match(
          result.stderr,
          scenario.message(evidenceType, variablePrefix),
          `${evidenceType} ${scenario.name}`,
        )
      }
    }
  })
})