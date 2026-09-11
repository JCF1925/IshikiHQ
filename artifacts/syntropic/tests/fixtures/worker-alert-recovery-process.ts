import {
  createWorkerAlertDeliveryFailureState,
  createWorkerAlertState,
  deliverWorkerAlert,
} from '../../lib/worker-alerting.ts'
import {
  runCalendarWorkerPoll,
  type CalendarWorkerDependencies,
} from '../../scripts/calendar-worker.ts'
import {
  runRedbarkWorkerPoll,
  type RedbarkWorkerDependencies,
} from '../../scripts/redbark-worker.ts'

type AlertCall = {
  type: string
  summary: string
  worker: string
  fields: Record<string, string | number | boolean>
}

type ScenarioResult = {
  alerts: AlertCall[]
  deliveryEvents: string[]
}

const receiverError = [
  'receiver=https://alerts.example.test/private',
  'body=provider-secret',
  'token=oauth-credential',
  'provider=google',
].join(' ')

async function runCalendarScenario(): Promise<ScenarioResult> {
  const alerts: AlertCall[] = []
  const deliveryEvents: string[] = []
  const deliveryFailureState = createWorkerAlertDeliveryFailureState()
  const state = createWorkerAlertState()
  let receiverAvailable = false

  const dependencies: CalendarWorkerDependencies = {
    processJobs: async () => [{ succeeded: false, deadLetter: true }] as never,
    getQueueAgeSeconds: async () => 0,
    getAlertConfig: () => ({
      owner: 'worker-process-test',
      environment: 'test',
      pollFailureThreshold: 2,
      queueAgeThresholdSeconds: 300,
      acknowledgementTargetMinutes: 15,
      ackWindowMinutes: 15,
      webhookUrl: '',
    }),
    deliverAlert: (type, summary, worker, fields = {}) => deliverWorkerAlert(
      type,
      summary,
      worker,
      fields,
      {
        sendAlert: async (
          alertType,
          alertSummary,
          alertWorker,
          alertFields = {},
        ) => {
          alerts.push({
            type: alertType,
            summary: alertSummary,
            worker: alertWorker ?? worker,
            fields: alertFields,
          })
          if (!receiverAvailable) throw new Error(receiverError)
          return true
        },
        logError: message => deliveryEvents.push(message),
        deliveryFailureState,
      },
    ),
    logEvent: () => undefined,
    safeError: () => ({ errorCategory: 'worker', errorCode: 'WORKER_ERROR' }),
  }

  const poll = () => runCalendarWorkerPoll(state, 25, dependencies)
  await poll()
  await poll()
  await poll()
  receiverAvailable = true
  await poll()
  receiverAvailable = false
  await poll()
  await poll()
  receiverAvailable = true
  await poll()

  return { alerts, deliveryEvents }
}

async function runRedbarkScenario(): Promise<ScenarioResult> {
  const alerts: AlertCall[] = []
  const deliveryEvents: string[] = []
  const deliveryFailureState = createWorkerAlertDeliveryFailureState()
  const state = createWorkerAlertState()
  let receiverAvailable = false

  const dependencies: RedbarkWorkerDependencies = {
    processJobs: async () => ({
      processed: 1,
      succeeded: 0,
      retrying: 0,
      deadLettered: 1,
      failed: 0,
    }),
    getQueueAgeSeconds: async () => 0,
    getAlertConfig: () => ({
      owner: 'worker-process-test',
      environment: 'test',
      pollFailureThreshold: 2,
      queueAgeThresholdSeconds: 300,
      acknowledgementTargetMinutes: 15,
      ackWindowMinutes: 15,
      webhookUrl: '',
    }),
    deliverAlert: (type, summary, worker, fields = {}) => deliverWorkerAlert(
      type,
      summary,
      worker,
      fields,
      {
        sendAlert: async (
          alertType,
          alertSummary,
          alertWorker,
          alertFields = {},
        ) => {
          alerts.push({
            type: alertType,
            summary: alertSummary,
            worker: alertWorker ?? worker,
            fields: alertFields,
          })
          if (!receiverAvailable) throw new Error(receiverError)
          return true
        },
        logError: message => deliveryEvents.push(message),
        deliveryFailureState,
      },
    ),
    logEvent: () => undefined,
    safeError: () => ({ errorCategory: 'worker', errorCode: 'WORKER_ERROR' }),
  }

  const poll = () => runRedbarkWorkerPoll(state, 10, dependencies)
  await poll()
  await poll()
  await poll()
  receiverAvailable = true
  await poll()
  receiverAvailable = false
  await poll()
  await poll()
  receiverAvailable = true
  await poll()

  return { alerts, deliveryEvents }
}

async function main() {
  const evidence = {
    calendar_sync: await runCalendarScenario(),
    redbark_sync: await runRedbarkScenario(),
  }

  process.stdout.write(JSON.stringify(evidence))
}

main().catch(error => {
  process.stderr.write(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})