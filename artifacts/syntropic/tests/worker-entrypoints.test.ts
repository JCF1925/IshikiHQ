import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, it } from 'node:test'
import {
  MAX_ALERT_OUTAGE_DURATION_SECONDS,
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

const execFileAsync = promisify(execFile)
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

    const fixture = fileURLToPath(new URL('./fixtures/worker-alert-recovery-process.ts', import.meta.url))
      const alerts: AlertCall[] = []
    const queueAges = [301, 0, 450]
    let poll = 0
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
    let shouldFail = true
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
        const event = JSON.parse(eventJson)
        assert.equal(event.worker, worker)
        assert.equal(
          (typeof event.suppressedFailures === 'number'
            && typeof event.outageDurationSeconds === 'number')
            || event.event === 'alert_delivery_failed',
          true,
        )
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

  it('keeps outage timing isolated for each worker', async () => {
    const deliveryEvents: string[] = []
    const deliveryFailureState = createWorkerAlertDeliveryFailureState()
      const alerts: AlertCall[] = []
      let receiverAvailable = false
    let now = 2_000_000
      const sendAlert = async () => {
        if (!receiverAvailable) {
          throw new Error(
            'receiver=https://alerts.example.test/private body=provider-secret token=oauth-credential provider=google',
          )
        }
        return true
      }
    const deliver = (worker: 'calendar_sync' | 'redbark_sync') => deliverWorkerAlert(
      'dead_letter',
      'A sync job reached dead-letter status.',
      worker,
      {},
      {
        sendAlert: async (_type, _summary, targetWorker) => {
          if (unavailableWorkers.has(targetWorker)) throw new Error('private receiver failure')
          return true
        },
        logError: message => deliveryEvents.push(message),
        deliveryFailureState,
        now: () => now,
      },
    )

      assert.equal(await deliver(), false)
      assert.equal(await deliver(), false)
      assert.equal(await deliver(), false)
      assert.equal(deliveryEvents.length, 1)
      assert.equal(deliveryFailureState.get(worker), 3)

      receiverAvailable = true
      now += 12_345
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
        outageDurationSeconds: 12,
        errorCategory: 'alerting',
        errorCode: 'DELIVERY_RECOVERED',
      })
      assert.equal(deliveryFailureState.has(worker), false)

      receiverAvailable = false
      now += 50_000
      assert.equal(await deliver(), false)
      assert.equal(await deliver(), false)
      assert.equal(deliveryEvents.length, 3)
      for (let attempt = 0; attempt < MAX_SUPPRESSED_DELIVERY_FAILURES + 25; attempt += 1) {
        await deliver()
      }
      assert.equal(deliveryFailureState.get(worker), MAX_SUPPRESSED_DELIVERY_FAILURES)

      receiverAvailable = true
      now += (MAX_ALERT_OUTAGE_DURATION_SECONDS + 1) * 1000
      assert.equal(await deliver(), true)
      assert.deepEqual(JSON.parse(deliveryEvents.at(-1)!), {
        event: 'alert_delivery_recovered',
        worker,
        suppressedFailures: MAX_SUPPRESSED_DELIVERY_FAILURES,
        outageDurationSeconds: MAX_ALERT_OUTAGE_DURATION_SECONDS,
        errorCategory: 'alerting',
        errorCode: 'DELIVERY_RECOVERED',
      })
      assert.equal(deliveryFailureState.has(worker), false)

      for (const eventJson of deliveryEvents) {
        const event = JSON.parse(eventJson)
        assert.equal(event.worker, worker)
        assert.equal(
          (typeof event.suppressedFailures === 'number'
            && typeof event.outageDurationSeconds === 'number')
            || event.event === 'alert_delivery_failed',
          true,
        )
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

  it('keeps outage timing isolated for each worker', async () => {
    const deliveryEvents: string[] = []
    const deliveryFailureState = createWorkerAlertDeliveryFailureState()
    const unavailableWorkers = new Set(['calendar_sync', 'redbark_sync'])
    let now = 2_000_000
    const deliver = (worker: 'calendar_sync' | 'redbark_sync') => deliverWorkerAlert(
      'dead_letter',
      'A sync job reached dead-letter status.',
      worker,
      {},
      {
        sendAlert: async (_type, _summary, targetWorker) => {
          if (unavailableWorkers.has(targetWorker)) throw new Error('private receiver failure')
          return true
        },
        logError: message => deliveryEvents.push(message),
        deliveryFailureState,
        now: () => now,
      },
    )

    assert.equal(await deliver('calendar_sync'), false)
    now += 4_000
    assert.equal(await deliver('redbark_sync'), false)
    now += 3_000
    unavailableWorkers.delete('calendar_sync')
    assert.equal(await deliver('calendar_sync'), true)
    assert.deepEqual(JSON.parse(deliveryEvents.at(-1)!), {
      event: 'alert_delivery_recovered',
      worker: 'calendar_sync',
      suppressedFailures: 1,
      outageDurationSeconds: 7,
      errorCategory: 'alerting',
      errorCode: 'DELIVERY_RECOVERED',
    })

    now += 2_000
    unavailableWorkers.delete('redbark_sync')
    assert.equal(await deliver('redbark_sync'), true)
    assert.deepEqual(JSON.parse(deliveryEvents.at(-1)!), {
      event: 'alert_delivery_recovered',
      worker: 'redbark_sync',
      suppressedFailures: 1,
      outageDurationSeconds: 5,
      errorCategory: 'alerting',
      errorCode: 'DELIVERY_RECOVERED',
    })
    assert.equal(deliveryFailureState.size, 0)
  })
})

    const rawEvidence = stdout.trim()

    const evidence = JSON.parse(rawEvidence) as Record<string, {
      alerts: AlertCall[]
      deliveryEvents: string[]
    }>

      const result = evidence[worker]

    const { stdout } = await execFileAsync(
      'pnpm',
      ['exec', 'tsx', fixture],
      {
        cwd: packageRoot,
        env: { ...process.env, NODE_ENV: 'test' },
        maxBuffer: 1_000_000,
      },
    )

    const packageRoot = fileURLToPath(new URL('../', import.meta.url))
