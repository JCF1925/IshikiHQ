import { NextResponse } from 'next/server'
import { ZodError, type ZodError as ZodErrorType, type ZodType } from 'zod'

export type ApiErrorCode =
  | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION_ERROR'
  | 'CONFLICT' | 'RATE_LIMITED' | 'INTERNAL_ERROR' | 'SERVICE_UNAVAILABLE' | 'LOCKED'
  | 'PROVIDER_GATES_CLOSED' | 'CONSENT_EXPIRED' | 'DISCONNECT_FAILED'
  | 'CALENDAR_CONSENT_REQUIRED' | 'CALENDAR_ACCESS_EXPIRED' | 'CALENDAR_ACCESS_REVOKED'
  | 'INVALID_SIGNATURE' | 'UNKNOWN_ACCOUNT'

export function apiError(code: ApiErrorCode, message: string, status: number, details?: unknown) {
  return NextResponse.json({ error: { code, message, ...(details ? { details } : {}) } }, { status })
}

export function apiSuccess<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export function validationDetails(error: ZodErrorType) {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || 'body',
    message: issue.message,
  }))
}
export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<
  { success: true; data: T } | { success: false; response: NextResponse }
> {
  try {
    const parsed = schema.safeParse(await request.json())
    if (parsed.success) return { success: true, data: parsed.data }
    return { success: false, response: apiError('VALIDATION_ERROR', 'Invalid request data', 400, validationDetails(parsed.error)) }
  } catch (error) {
    if (error instanceof ZodError) return { success: false, response: apiError('VALIDATION_ERROR', 'Invalid request data', 400) }
    return { success: false, response: apiError('VALIDATION_ERROR', 'Request body must be valid JSON', 400) }
  }
}

export function clientIp(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')
    ?? 'unknown'
}
