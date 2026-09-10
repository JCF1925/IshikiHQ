import { prisma } from './db'
import {
  buildOperationsAlert,
  getOperationsAlertConfig,
  sendOperationsAlert,
  type OperationsAlertConfig,
  type OperationsAlertType,
} from './operations-alerting'

export type WorkerName = 'calendar_sync' | 'redbark_sync'
export { buildOperationsAlert, getOperationsAlertConfig, sendOperationsAlert }
export type { OperationsAlertConfig, OperationsAlertType }

export const MAX_SUPPRESSED_DELIVERY_FAILURES = 100
const workersWithSuppressedDeliveryFailures = new Map<WorkerName, number>()
export type WorkerAlertDeliveryFailureState = Map<WorkerName, number>

export function createWorkerAlertDeliveryFailureState(): WorkerAlertDeliveryFailureState {
  return new Map()
}

export type WorkerAlertState = {
  consecutivePollFailures: number
  queueAgeAlerted: boolean
}

export function createWorkerAlertState(): WorkerAlertState {
  return {
    consecutivePollFailures: 0,
    queueAgeAlerted: false,
  }
}

export function recordWorkerPollFailure(
  state: WorkerAlertState,
  threshold: number,
) {
  state.consecutivePollFailures += 1
  return state.consecutivePollFailures === threshold
}

export function resetWorkerPollFailures(state: WorkerAlertState) {
  state.consecutivePollFailures = 0
}

export function shouldAlertWorkerQueueAge(
  state: WorkerAlertState,
  queueAgeSeconds: number,
  threshold: number,
) {
  if (queueAgeSeconds > threshold && !state.queueAgeAlerted) {
    state.queueAgeAlerted = true
    return true
  }
  if (queueAgeSeconds <= threshold) {
    state.queueAgeAlerted = false
  }
  return false
}

export async function deliverWorkerAlert(
  type: Exclude<OperationsAlertType, 'synthetic'>,
  summary: string,
  worker: WorkerName,
  fields: Record<string, string | number | boolean> = {},
  dependencies: {
    sendAlert?: typeof sendOperationsAlert
    logError?: (message: string) => void
    deliveryFailureState?: WorkerAlertDeliveryFailureState
  } = {},
) {
  const deliveryFailureState = dependencies.deliveryFailureState
    ?? workersWithSuppressedDeliveryFailures
  const sendAlert = dependencies.sendAlert ?? sendOperationsAlert
  try {
    const delivered = await sendAlert(type, summary, worker, fields)
    if (delivered) {
      const suppressedFailures = deliveryFailureState.get(worker) ?? 0
      deliveryFailureState.delete(worker)
      if (suppressedFailures > 0) {
        ;(dependencies.logError ?? console.error)(JSON.stringify({
          event: 'alert_delivery_recovered',
          worker,
          suppressedFailures,
          errorCategory: 'alerting',
          errorCode: 'DELIVERY_RECOVERED',
        }))
      }
    }
    return delivered
  } catch {
    // Alert delivery must not take a worker down. The failure itself is
    // observable without exposing a URL, response body, or credentials.
    // The map is bounded by WorkerName and each worker's count is capped.
    const suppressedFailures = deliveryFailureState.get(worker) ?? 0
    deliveryFailureState.set(
      worker,
      Math.min(MAX_SUPPRESSED_DELIVERY_FAILURES, suppressedFailures + 1),
    )
    if (suppressedFailures === 0) {
      ;(dependencies.logError ?? console.error)(JSON.stringify({
        event: 'alert_delivery_failed',
        worker,
        errorCategory: 'alerting',
        errorCode: 'DELIVERY_FAILED',
      }))
    }
    return false
  }
}

export async function getWorkerQueueAgeSeconds(
  worker: WorkerName,
  now = new Date(),
) {
  const oldest = worker === 'calendar_sync'
    ? await prisma.calendarSyncJob.findFirst({
        where: {
          status: { in: ['queued', 'failed'] },
          scheduledAt: { lte: now },
        },
        orderBy: { scheduledAt: 'asc' },
        select: { scheduledAt: true },
      })
    : await prisma.redbarkSyncJob.findFirst({
        where: {
          status: { in: ['queued', 'retrying'] },
          OR: [
            { status: 'queued' },
            { nextRetryAt: null },
            { nextRetryAt: { lte: now } },
          ],
        },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      })

  if (!oldest) return 0
  const timestamp = worker === 'calendar_sync'
    ? (oldest as { scheduledAt: Date }).scheduledAt
    : (oldest as { createdAt: Date }).createdAt
  return Math.max(0, Math.floor((now.getTime() - timestamp.getTime()) / 1000))
}