type SafeLogValue = string | number | boolean | null

const SAFE_ERROR_CODES = new Set([
  'P1001',
  'P1002',
  'P1017',
  'P2021',
  'P2024',
  'P2034',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
])

export function safeWorkerError(error: unknown): Record<string, SafeLogValue> {
  const code = typeof error === 'object' && error && 'code' in error
    ? String(error.code)
    : null
  return {
    errorCategory: code?.startsWith('P')
      ? 'database'
      : code?.startsWith('E')
        ? 'network'
        : 'unexpected',
    errorCode: code && SAFE_ERROR_CODES.has(code) ? code : null,
  }
}

export function logWorkerEvent(
  level: 'info' | 'error',
  event: string,
  worker: 'calendar_sync' | 'redbark_sync',
  fields: Record<string, SafeLogValue> = {},
) {
  // Callers must pass aggregate counters/configuration only. This boundary
  // intentionally has no exception, payload, URL, token, cursor, or ID input.
  console[level](JSON.stringify({ event, worker, ...fields }))
}