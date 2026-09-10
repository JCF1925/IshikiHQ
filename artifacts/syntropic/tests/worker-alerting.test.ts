import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildOperationsAlert,
  createWorkerAlertState,
  getOperationsAlertConfig,
  recordWorkerPollFailure,
  resetWorkerPollFailures,
  shouldAlertWorkerQueueAge,
} from '../lib/worker-alerting.ts'

const config = getOperationsAlertConfig({
  OPS_ALERT_OWNER: 'operations@example.test',
  OPS_ALERT_ENVIRONMENT: 'test',
  OPS_ALERT_POLL_FAILURE_THRESHOLD: '3',
  OPS_ALERT_QUEUE_AGE_SECONDS: '300',
  OPS_ALERT_ACK_WINDOW_MINUTES: '15',
  OPS_ALERT_WEBHOOK_URL: 'https://alerts.example.test/receiver',
})

describe('worker alert recovery thresholds', () => {
  it('alerts on the repeated-poll threshold once, then resets after a successful poll', () => {
    const state = createWorkerAlertState()

    assert.equal(recordWorkerPollFailure(state, 3), false)
    assert.equal(recordWorkerPollFailure(state, 3), false)
    assert.equal(recordWorkerPollFailure(state, 3), true)
    assert.equal(recordWorkerPollFailure(state, 3), false)
    assert.equal(state.consecutivePollFailures, 4)

    resetWorkerPollFailures(state)
    assert.equal(state.consecutivePollFailures, 0)
    assert.equal(recordWorkerPollFailure(state, 3), false)
    assert.equal(recordWorkerPollFailure(state, 3), false)
    assert.equal(recordWorkerPollFailure(state, 3), true)
  })

  it('alerts once while queue age is above threshold and re-arms after recovery', () => {
    const state = createWorkerAlertState()

    assert.equal(shouldAlertWorkerQueueAge(state, 300, 300), false)
    assert.equal(shouldAlertWorkerQueueAge(state, 301, 300), true)
    assert.equal(shouldAlertWorkerQueueAge(state, 900, 300), false)
    assert.equal(shouldAlertWorkerQueueAge(state, 300, 300), false)
    assert.equal(shouldAlertWorkerQueueAge(state, 301, 300), true)
  })
})

describe('worker alert payloads', () => {
  it('represents dead-letter and unexpected-exit alerts with only aggregate details', () => {
    const deadLetter = buildOperationsAlert(
      'dead_letter',
      'A new calendar sync job reached dead letter.',
      config,
      'calendar_sync',
      {
        count: 2,
        jobId: 'job-secret-id',
        providerEventId: 'provider-event-id',
        accessToken: 'oauth-secret',
        receiverUrl: 'https://provider.example.test/event',
      },
    )
    const workerExit = buildOperationsAlert(
      'worker_exit',
      'Redbark sync worker exited unexpectedly.',
      config,
      'redbark_sync',
      {
        count: 1,
        jobId: 'job-secret-id',
        provider: 'google',
        url: 'https://provider.example.test',
      },
    )

    assert.deepEqual(Object.keys(deadLetter.details).sort(), [
      'acknowledgementTargetMinutes',
      'count',
    ])
    assert.deepEqual(Object.keys(workerExit.details), ['acknowledgementTargetMinutes'])
    assert.deepEqual(Object.keys(deadLetter).sort(), [
      'alertType',
      'details',
      'environment',
      'observedAt',
      'owner',
      'severity',
      'source',
      'summary',
      'worker',
    ])
    const payload = JSON.stringify({ deadLetter, workerExit })
    for (const forbidden of [
      'job-secret-id',
      'provider-event-id',
      'oauth-secret',
      'provider.example.test',
      'google',
    ]) {
      assert.equal(payload.includes(forbidden), false, `payload leaked ${forbidden}`)
    }
    assert.equal(deadLetter.details.count, 2)
    assert.equal(deadLetter.worker, 'calendar_sync')
    assert.equal(workerExit.worker, 'redbark_sync')
    assert.equal(deadLetter.alertType, 'dead_letter')
    assert.equal(workerExit.alertType, 'worker_exit')
  })

  it('keeps polling and queue alerts to their allowlisted aggregate fields', () => {
    const pollFailure = buildOperationsAlert(
      'poll_failure',
      'Calendar sync polling failed repeatedly.',
      config,
      'calendar_sync',
      { consecutiveFailures: 3, token: 'secret', id: 'private-id' },
    )
    const queueAge = buildOperationsAlert(
      'queue_age',
      'Redbark sync queue age exceeded five minutes.',
      config,
      'redbark_sync',
      { queueAgeSeconds: 301, externalUrl: 'https://provider.example.test' },
    )

    assert.deepEqual(Object.keys(pollFailure.details).sort(), [
      'acknowledgementTargetMinutes',
      'consecutiveFailures',
    ])
    assert.deepEqual(Object.keys(queueAge.details).sort(), [
      'acknowledgementTargetMinutes',
      'queueAgeSeconds',
    ])
    assert.equal(JSON.stringify({ pollFailure, queueAge }).includes('secret'), false)
    assert.equal(JSON.stringify({ pollFailure, queueAge }).includes('private-id'), false)
    assert.equal(JSON.stringify({ pollFailure, queueAge }).includes('provider.example.test'), false)
  })
})