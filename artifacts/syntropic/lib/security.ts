import { z } from 'zod'

// Deliberately process-local: portable for local/single-instance deployments. Use a shared
// rate-limit store before horizontally scaling.
const attempts = new Map<string, { count: number; resetAt: number }>()
export function takeRateLimit(key: string, limit = 10, windowMs = 15 * 60_000) {
  const now = Date.now()
  const current = attempts.get(key)
  const entry = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current
  entry.count += 1
  attempts.set(key, entry)
  return { allowed: entry.count <= limit, retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000) }
}

export const passwordPolicy = z.string().min(12, 'Password must be at least 12 characters').max(128)
  .refine((value) => /[a-z]/.test(value), 'Password must include a lowercase letter')
  .refine((value) => /[A-Z]/.test(value), 'Password must include an uppercase letter')
  .refine((value) => /\d/.test(value), 'Password must include a number')
  .refine((value) => /[^A-Za-z0-9]/.test(value), 'Password must include a symbol')