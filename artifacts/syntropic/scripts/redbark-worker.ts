import { processDueRedbarkSyncJobs } from '../lib/redbark-service'
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

const pollIntervalMs = Math.max(1_000, Number(process.env.REDBARK_WORKER_POLL_MS ?? 15_000))
const batchSize = Math.max(1, Math.min(100, Number(process.env.REDBARK_WORKER_BATCH_SIZE ?? 10)))
let stopping = false
let missingSchemaNotified = false
const alertState = createWorkerAlertState()

process.once('SIGTERM', () => { stopping = true })
process.once('SIGINT', () => { stopping = true })

type RedbarkSyncSummary = Awaited<ReturnType<typeof processDueRedbarkSyncJobs>>

export type RedbarkWorkerDependencies = {
  processJobs: (limit: number) => Promise<RedbarkSyncSummary>
  getQueueAgeSeconds: typeof getWorkerQueueAgeSeconds
  getAlertConfig: typeof getOperationsAlertConfig
  deliverAlert: typeof deliverWorkerAlert
  logEvent: typeof logWorkerEvent
  safeError: typeof safeWorkerError
}

const redbarkWorkerDependencies: RedbarkWorkerDependencies = {
  processJobs: processDueRedbarkSyncJobs,
  getQueueAgeSeconds: getWorkerQueueAgeSeconds,
  getAlertConfig: getOperationsAlertConfig,
  deliverAlert: deliverWorkerAlert,
  logEvent: logWorkerEvent,
  safeError: safeWorkerError,
}

export async function runRedbarkWorkerPoll(
  state: WorkerAlertState,
  limit = batchSize,
  dependencies: RedbarkWorkerDependencies = redbarkWorkerDependencies,
) {
  try {
    const summary = await dependencies.processJobs(limit)
    missingSchemaNotified = false
    if (summary.processed) dependencies.logEvent('info', 'batch_completed', 'redbark_sync', summary)
    resetWorkerPollFailures(state)
    const queueAgeSeconds = await dependencies.getQueueAgeSeconds('redbark_sync')
    const queueThreshold = dependencies.getAlertConfig().queueAgeThresholdSeconds
    if (shouldAlertWorkerQueueAge(state, queueAgeSeconds, queueThreshold)) {
      await dependencies.deliverAlert('queue_age', 'Redbark sync queue age exceeded five minutes.', 'redbark_sync', { queueAgeSeconds })
    }
    if (summary.deadLettered) {
      await dependencies.deliverAlert('dead_letter', 'A new Redbark sync job reached dead letter.', 'redbark_sync', { count: summary.deadLettered })
    }
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : null
    if (code === 'P2021') {
      if (!missingSchemaNotified) {
        dependencies.logEvent('info', 'schema_unavailable', 'redbark_sync')
        missingSchemaNotified = true
      }
    } else {
      dependencies.logEvent('error', 'poll_failed', 'redbark_sync', dependencies.safeError(error))
    }
    const failureThreshold = dependencies.getAlertConfig().pollFailureThreshold
    if (recordWorkerPollFailure(state, failureThreshold)) {
      await dependencies.deliverAlert('poll_failure', 'Redbark sync polling failed repeatedly.', 'redbark_sync', { consecutiveFailures: state.consecutivePollFailures })
    }
  }
}

export async function handleRedbarkWorkerExit(
  error: unknown,
  dependencies: RedbarkWorkerDependencies = redbarkWorkerDependencies,
) {
  await dependencies.deliverAlert('worker_exit', 'Redbark sync worker exited unexpectedly.', 'redbark_sync')
  dependencies.logEvent('error', 'worker_stopped', 'redbark_sync', dependencies.safeError(error))
  process.exitCode = 1
}

async function main() {
  logWorkerEvent('info', 'worker_started', 'redbark_sync', { pollIntervalMs, batchSize })
  while (!stopping) {
    await runRedbarkWorkerPoll(alertState)
    if (!stopping) await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(handleRedbarkWorkerExit)
}
