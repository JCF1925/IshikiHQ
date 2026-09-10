import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import {
  MAX_SUPPRESSED_DELIVERY_FAILURES,
  createWorkerAlertDeliveryFailureState,
  createWorkerAlertState,
  deliverWorkerAlert,
} from '../lib/worker-alerting.ts'
import {
  handleCalendarWorkerExit,
  runCalendarWorkerPoll,
  type CalendarWorkerDependencies,
} from '../scripts/calendar-worker.ts'
import {
  handleRedbarkWorkerExit,
  runRedbarkWorkerPoll,
  type RedbarkWorkerDependencies,
} from '../scripts/redbark-worker.ts'

type AlertCall = {
  type: string
  summary: string
  worker: string
  fields: Record<string, string | number | boolean>
}

function alertRecorder(calls: AlertCall[]) {
  return async (
    type: AlertCall['type'],
    summary: string,
    worker: AlertCall['worker'],
    fields: AlertCall['fields'] = {},
  ) => {
    calls.push({ type, summary, worker, fields })
    return true
  }
}

const originalExitCode = process.exitCode
afterEach(() => {
  process.exitCode = originalExitCode
})

describe('sync worker entrypoint alert wiring', () => {
  it('re-arms Calendar queue alerts after recovery and reports dead letters', async () => {
    const alerts: AlertCall[] = []
    const queueAges = [301, 0, 450]
    let poll = 0
    const dependencies: CalendarWorkerDependencies = {
      processJobs: async () => poll++ === 0
        ? [{ succeeded: false, deadLetter: true }] as never
        : [],
      getQueueAgeSeconds: async () => queueAges.shift() ?? 0,
      getAlertConfig: () => ({
        owner: 'owner@example.test',
        environment: 'test',
        pollFailureThreshold: 2,
        queueAgeThresholdSeconds: 300,
        acknowledgementTargetMinutes: 15,
        ackWindowMinutes: 15,
        webhookUrl: '',
      }),
      deliverAlert: alertRecorder(alerts) as CalendarWorkerDependencies['deliverAlert'],
      logEvent: () => undefined,
      safeError: () => ({ errorCategory: 'worker', errorCode: 'WORKER_ERROR' }),
    }
    const state = createWorkerAlertState()

    await runCalendarWorkerPoll(state, 25, dependencies)
    await runCalendarWorkerPoll(state, 25, dependencies)
    await runCalendarWorkerPoll(state, 25, dependencies)

    assert.deepEqual(alerts.map(alert => alert.type), ['queue_age', 'dead_letter', 'queue_age'])
    assert.deepEqual(alerts.map(alert => alert.worker), ['calendar_sync', 'calendar_sync', 'calendar_sync'])
    assert.deepEqual(alerts.map(alert => alert.fields), [
      { queueAgeSeconds: 301 },
      { count: 1 },
      { queueAgeSeconds: 450 },
    ])
    assert.equal(JSON.stringify(alerts).includes('provider'), false)
  })

  it('reports Redbark poll thresholds, dead letters, and unexpected exits', async () => {
    const alerts: AlertCall[] = []
    let shouldFail = true
    const dependencies: RedbarkWorkerDependencies = {
      processJobs: async () => {
        if (shouldFail) throw new Error('private provider response')
        return { processed: 1, succeeded: 0, retrying: 0, deadLettered: 2, failed: 0 }
      },
      getQueueAgeSeconds: async () => 0,
      getAlertConfig: () => ({
        owner: 'owner@example.test',
        environment: 'test',
        pollFailureThreshold: 2,
        queueAgeThresholdSeconds: 300,
        acknowledgementTargetMinutes: 15,
        ackWindowMinutes: 15,
        webhookUrl: '',
      }),
      deliverAlert: alertRecorder(alerts) as RedbarkWorkerDependencies['deliverAlert'],
      logEvent: () => undefined,
      safeError: () => ({ errorCategory: 'worker', errorCode: 'WORKER_ERROR' }),
    }
    const state = createWorkerAlertState()

    await runRedbarkWorkerPoll(state, 10, dependencies)
    await runRedbarkWorkerPoll(state, 10, dependencies)
    shouldFail = false
    await runRedbarkWorkerPoll(state, 10, dependencies)
    await handleRedbarkWorkerExit(new Error('private exit detail'), dependencies)

    assert.deepEqual(alerts.map(alert => alert.type), ['poll_failure', 'dead_letter', 'worker_exit'])
    assert.deepEqual(alerts.map(alert => alert.worker), ['redbark_sync', 'redbark_sync', 'redbark_sync'])
    assert.deepEqual(alerts.map(alert => alert.fields), [
      { consecutiveFailures: 2 },
      { count: 2 },
      {},
    ])
    assert.equal(state.consecutivePollFailures, 0)
    assert.equal(process.exitCode, 1)
    assert.equal(JSON.stringify(alerts).includes('private'), false)
  })

  it('reports an unexpected Calendar exit without including the thrown error', async () => {
    const alerts: AlertCall[] = []
    const dependencies: CalendarWorkerDependencies = {
      processJobs: async () => [],
      getQueueAgeSeconds: async () => 0,
      getAlertConfig: () => ({
        owner: 'owner@example.test',
        environment: 'test',
        pollFailureThreshold: 2,
        queueAgeThresholdSeconds: 300,
        acknowledgementTargetMinutes: 15,
        ackWindowMinutes: 15,
        webhookUrl: '',
      }),
      deliverAlert: alertRecorder(alerts) as CalendarWorkerDependencies['deliverAlert'],
      logEvent: () => undefined,
      safeError: () => ({ errorCategory: 'worker', errorCode: 'WORKER_ERROR' }),
    }

    await handleCalendarWorkerExit(new Error('oauth-token-private'), dependencies)

    assert.deepEqual(alerts, [{
      type: 'worker_exit',
      summary: 'Calendar sync worker exited unexpectedly.',
      worker: 'calendar_sync',
      fields: {},
    }])
    assert.equal(JSON.stringify(alerts).includes('oauth-token-private'), false)
  })

  for (const worker of ['calendar_sync', 'redbark_sync'] as const) {
    it(`keeps ${worker} polling after its alert receiver rejects delivery`, async () => {
      const deliveryEvents: string[] = []
      const deliveryFailureState = createWorkerAlertDeliveryFailureState()
      let completedPolls = 0
      const deliverAlert = (
        type: Parameters<typeof deliverWorkerAlert>[0],
        summary: string,
        targetWorker: typeof worker,
        fields: Record<string, string | number | boolean> = {},
      ) => deliverWorkerAlert(type, summary, targetWorker, fields, {
        sendAlert: async () => {
          throw new Error(
            'receiver=https://alerts.example.test/private body=provider-secret token=oauth-credential provider=google',
          )
        },
        logError: message => deliveryEvents.push(message),
        deliveryFailureState,
      })

      if (worker === 'calendar_sync') {
        const dependencies: CalendarWorkerDependencies = {
          processJobs: async () => {
            completedPolls += 1
            return completedPolls === 1 ? [{ succeeded: false, deadLetter: true }] as never : []
          },
          getQueueAgeSeconds: async () => 0,
          getAlertConfig: () => ({
            owner: 'owner@example.test',
            environment: 'test',
            pollFailureThreshold: 2,
            queueAgeThresholdSeconds: 300,
            acknowledgementTargetMinutes: 15,
            ackWindowMinutes: 15,
            webhookUrl: '',
          }),
          deliverAlert: deliverAlert as CalendarWorkerDependencies['deliverAlert'],
          logEvent: () => undefined,
          safeError: () => ({ errorCategory: 'worker', errorCode: 'WORKER_ERROR' }),
        }
        const state = createWorkerAlertState()
        await runCalendarWorkerPoll(state, 25, dependencies)
        await runCalendarWorkerPoll(state, 25, dependencies)
      } else {
        const dependencies: RedbarkWorkerDependencies = {
          processJobs: async () => {
            completedPolls += 1
            return {
              processed: 1,
              succeeded: completedPolls > 1 ? 1 : 0,
              retrying: 0,
              deadLettered: completedPolls === 1 ? 1 : 0,
              failed: 0,
            }
          },
          getQueueAgeSeconds: async () => 0,
          getAlertConfig: () => ({
            owner: 'owner@example.test',
            environment: 'test',
            pollFailureThreshold: 2,
            queueAgeThresholdSeconds: 300,
            acknowledgementTargetMinutes: 15,
            ackWindowMinutes: 15,
            webhookUrl: '',
          }),
          deliverAlert: deliverAlert as RedbarkWorkerDependencies['deliverAlert'],
          logEvent: () => undefined,
          safeError: () => ({ errorCategory: 'worker', errorCode: 'WORKER_ERROR' }),
        }
        const state = createWorkerAlertState()
        await runRedbarkWorkerPoll(state, 10, dependencies)
        await runRedbarkWorkerPoll(state, 10, dependencies)
      }

      assert.equal(completedPolls, 2)
      assert.equal(deliveryEvents.length, 1)
      const event = JSON.parse(deliveryEvents[0])
      assert.deepEqual(event, {
        event: 'alert_delivery_failed',
        worker,
        errorCategory: 'alerting',
        errorCode: 'DELIVERY_FAILED',
      })
      for (const forbidden of [
        'alerts.example.test',
        'private',
        'provider-secret',
        'oauth-credential',
        'google',
        'response',
      ]) {
        assert.equal(deliveryEvents[0].includes(forbidden), false, `failure event leaked ${forbidden}`)
      }
    })

    it(`aggregates ${worker} delivery failures and reports one sanitized recovery summary`, async () => {
      const deliveryEvents: string[] = []
      const deliveryFailureState = createWorkerAlertDeliveryFailureState()
      const alerts: AlertCall[] = []
      let receiverAvailable = false
      const sendAlert = async () => {
        if (!receiverAvailable) {
          throw new Error(
            'receiver=https://alerts.example.test/private body=provider-secret token=oauth-credential provider=google',
          )
        }
        return true
      }
      const deliver = () => deliverWorkerAlert(
        'dead_letter',
        'A sync job reached dead-letter status.',
        worker,
        { count: 1 },
        {
          sendAlert: async (
            type: AlertCall['type'],
            summary: string,
            targetWorker: string | undefined,
            fields: AlertCall['fields'] = {},
          ) => {
            alerts.push({ type, summary, worker: targetWorker ?? worker, fields })
            return sendAlert()
          },
          logError: message => deliveryEvents.push(message),
          deliveryFailureState,
        },
      )

      assert.equal(await deliver(), false)
      assert.equal(await deliver(), false)
      assert.equal(await deliver(), false)
      assert.equal(deliveryEvents.length, 1)
      assert.equal(deliveryFailureState.get(worker), 3)

      receiverAvailable = true
      assert.equal(await deliver(), true)
      assert.deepEqual(alerts.map(alert => alert.type), [
        'dead_letter',
        'dead_letter',
        'dead_letter',
        'dead_letter',
      ])
      assert.deepEqual(JSON.parse(deliveryEvents[1]), {
        event: 'alert_delivery_recovered',
        worker,
        suppressedFailures: 3,
        errorCategory: 'alerting',
        errorCode: 'DELIVERY_RECOVERED',
      })
      assert.equal(deliveryFailureState.has(worker), false)

      receiverAvailable = false
      assert.equal(await deliver(), false)
      assert.equal(await deliver(), false)
      assert.equal(deliveryEvents.length, 3)
      for (let attempt = 0; attempt < MAX_SUPPRESSED_DELIVERY_FAILURES + 25; attempt += 1) {
        await deliver()
      }
      assert.equal(deliveryFailureState.get(worker), MAX_SUPPRESSED_DELIVERY_FAILURES)

      receiverAvailable = true
      assert.equal(await deliver(), true)
      assert.deepEqual(JSON.parse(deliveryEvents.at(-1)!), {
        event: 'alert_delivery_recovered',
        worker,
        suppressedFailures: MAX_SUPPRESSED_DELIVERY_FAILURES,
        errorCategory: 'alerting',
        errorCode: 'DELIVERY_RECOVERED',
      })
      assert.equal(deliveryFailureState.has(worker), false)

      for (const eventJson of deliveryEvents) {
        const event = JSON.parse(eventJson)
        assert.equal(event.worker, worker)
        assert.equal(typeof event.suppressedFailures === 'number' || event.event === 'alert_delivery_failed', true)
        for (const forbidden of [
          'alerts.example.test',
          'private',
          'provider-secret',
          'oauth-credential',
          'google',
          'response',
        ]) {
          assert.equal(eventJson.includes(forbidden), false, `failure event leaked ${forbidden}`)
        }
      }
    })
  }
})