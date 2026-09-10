import { processDueCalendarSyncJobs } from '../lib/calendar-server'
import { pathToFileURL } from 'node:url'
import {
  createWorkerAlertState,
  deliverWorkerAlert,
  getOperationsAlertConfig,
  getWorkerQueueAgeSeconds,
  recordWorkerPollFailure,
  resetWorkerPollFailures,
  shouldAlertWorkerQueueAge,
} from '../lib/worker-alerting'
import { logWorkerEvent, safeWorkerError } from '../lib/worker-observability'
import type { WorkerAlertState } from '../lib/worker-alerting'

const pollIntervalMs = Math.max(1_000, Number(process.env.CALENDAR_WORKER_POLL_MS ?? 15_000))
const batchSize = Math.max(1, Math.min(100, Number(process.env.CALENDAR_WORKER_BATCH_SIZE ?? 25)))

let stopping = false
const alertState = createWorkerAlertState()
process.once('SIGINT', () => { stopping = true })
process.once('SIGTERM', () => { stopping = true })

type CalendarSyncResult = Awaited<ReturnType<typeof processDueCalendarSyncJobs>>[number]

export type CalendarWorkerDependencies = {
  processJobs: (limit: number) => Promise<CalendarSyncResult[]>
  getQueueAgeSeconds: typeof getWorkerQueueAgeSeconds
  getAlertConfig: typeof getOperationsAlertConfig
  deliverAlert: typeof deliverWorkerAlert
  logEvent: typeof logWorkerEvent
  safeError: typeof safeWorkerError
}

const calendarWorkerDependencies: CalendarWorkerDependencies = {
  processJobs: processDueCalendarSyncJobs,
  getQueueAgeSeconds: getWorkerQueueAgeSeconds,
  getAlertConfig: getOperationsAlertConfig,
  deliverAlert: deliverWorkerAlert,
  logEvent: logWorkerEvent,
  safeError: safeWorkerError,
}

export async function runCalendarWorkerPoll(
  state: WorkerAlertState,
  limit = batchSize,
  dependencies: CalendarWorkerDependencies = calendarWorkerDependencies,
) {
  try {
    const results = await dependencies.processJobs(limit)
    if (results.length) {
      dependencies.logEvent('info', 'batch_completed', 'calendar_sync', {
        processed: results.length,
        succeeded: results.filter(result => 'succeeded' in result && result.succeeded).length,
        retrying: results.filter(result => 'succeeded' in result && !result.succeeded && !('deadLetter' in result && result.deadLetter)).length,
        deadLettered: results.filter(result => 'deadLetter' in result && result.deadLetter).length,
        rescheduled: results.filter(result => 'rescheduled' in result && result.rescheduled).length,
      })
    }
    resetWorkerPollFailures(state)
    const queueAgeSeconds = await dependencies.getQueueAgeSeconds('calendar_sync')
    const queueThreshold = dependencies.getAlertConfig().queueAgeThresholdSeconds
    if (shouldAlertWorkerQueueAge(state, queueAgeSeconds, queueThreshold)) {
      await dependencies.deliverAlert('queue_age', 'Calendar sync queue age exceeded five minutes.', 'calendar_sync', { queueAgeSeconds })
    }
    const deadLettered = results.filter(result => 'deadLetter' in result && result.deadLetter).length
    if (deadLettered) {
      await dependencies.deliverAlert('dead_letter', 'A new calendar sync job reached dead letter.', 'calendar_sync', { count: deadLettered })
    }
  } catch (error) {
    dependencies.logEvent('error', 'poll_failed', 'calendar_sync', dependencies.safeError(error))
    const failureThreshold = dependencies.getAlertConfig().pollFailureThreshold
    if (recordWorkerPollFailure(state, failureThreshold)) {
      await dependencies.deliverAlert('poll_failure', 'Calendar sync polling failed repeatedly.', 'calendar_sync', { consecutiveFailures: state.consecutivePollFailures })
    }
  }
}

export async function handleCalendarWorkerExit(
  error: unknown,
  dependencies: CalendarWorkerDependencies = calendarWorkerDependencies,
) {
  await dependencies.deliverAlert('worker_exit', 'Calendar sync worker exited unexpectedly.', 'calendar_sync')
  dependencies.logEvent('error', 'worker_stopped', 'calendar_sync', dependencies.safeError(error))
  process.exitCode = 1
}

async function main() {
  logWorkerEvent('info', 'worker_started', 'calendar_sync', { pollIntervalMs, batchSize })
  do {
    await runCalendarWorkerPoll(alertState)
    if (!stopping) await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
  } while (!stopping)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(handleCalendarWorkerExit)
}
