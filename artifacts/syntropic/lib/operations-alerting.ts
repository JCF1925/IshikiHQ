export type OperationsAlertType =
  | 'worker_exit'
  | 'poll_failure'
  | 'queue_age'
  | 'dead_letter'
  | 'ownership_guard_violation'
  | 'evidence_expiry'
  | 'synthetic'

type AlertEnvironment = Record<string, string | undefined>

export type OperationsAlertConfig = {
  webhookUrl: string
  owner: string
  environment: string
  pollFailureThreshold: number
  queueAgeThresholdSeconds: number
  ackWindowMinutes: number
}

const ALLOWED_DETAIL_KEYS: Record<OperationsAlertType, readonly string[]> = {
  worker_exit: [],
  poll_failure: ['consecutiveFailures'],
  queue_age: ['queueAgeSeconds'],
  dead_letter: ['count'],
  ownership_guard_violation: ['groupedCount', 'groupingWindowSeconds'],
  evidence_expiry: ['evidenceType', 'dueDate', 'status', 'operationalRole'],
  synthetic: ['drill'],
}

export function getOperationsAlertConfig(
  env: AlertEnvironment = process.env,
): OperationsAlertConfig {
  return {
    webhookUrl: env.OPS_ALERT_WEBHOOK_URL?.trim() ?? '',
    owner: env.OPS_ALERT_OWNER?.trim() ?? '',
    environment: env.OPS_ALERT_ENVIRONMENT?.trim() || 'development',
    pollFailureThreshold: boundedPositiveInteger(
      env.OPS_ALERT_POLL_FAILURE_THRESHOLD,
      3,
    ),
    queueAgeThresholdSeconds: boundedPositiveInteger(
      env.OPS_ALERT_QUEUE_AGE_SECONDS,
      300,
    ),
    ackWindowMinutes: boundedPositiveInteger(
      env.OPS_ALERT_ACK_WINDOW_MINUTES,
      15,
    ),
  }
}

function boundedPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value ?? fallback)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function buildOperationsAlert(
  type: OperationsAlertType,
  summary: string,
  config: OperationsAlertConfig,
  worker?: string,
  fields: Record<string, string | number | boolean> = {},
) {
  const allowedKeys = new Set(ALLOWED_DETAIL_KEYS[type])
  const safeDetails: Record<string, string | number | boolean> = Object.fromEntries(
    Object.entries(fields).filter(([key, value]) => (
      allowedKeys.has(key)
      && (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string')
    )),
  )
  const details: Record<string, string | number | boolean> = type === 'evidence_expiry'
    ? safeDetails
    : {
        ...safeDetails,
        acknowledgementTargetMinutes: config.ackWindowMinutes,
      }

  return {
    source: 'syntropic',
    environment: config.environment,
    alertType: type,
    severity: type === 'synthetic' ? 'info' : 'critical',
    owner: config.owner,
    summary,
    worker: worker ?? null,
    observedAt: new Date().toISOString(),
    details,
  }
}

export async function sendOperationsAlert(
  type: OperationsAlertType,
  summary: string,
  worker?: string,
  fields: Record<string, string | number | boolean> = {},
  options: { requireReceiver?: boolean } = {},
) {
  const config = getOperationsAlertConfig()
  if (!config.webhookUrl) {
    if (options.requireReceiver) {
      throw new Error('OPS_ALERT_WEBHOOK_URL is required')
    }
    return false
  }
  if (!config.owner) throw new Error('OPS_ALERT_OWNER is required')

  const response = await fetch(config.webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(buildOperationsAlert(type, summary, config, worker, fields)),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) {
    throw new Error(`alert receiver returned HTTP ${response.status}`)
  }
  return true
}