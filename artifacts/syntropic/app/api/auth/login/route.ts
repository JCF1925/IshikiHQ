export const dynamic = "force-dynamic";
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { apiError, apiSuccess, clientIp, parseBody } from '@/lib/api'
import { loginSchema } from '@/lib/validation'
import { takeRateLimit } from '@/lib/security'

export async function POST(request: Request) {
  try {
    const parsed = await parseBody(request, loginSchema)
    if (!parsed.success) return parsed.response
    const { email, password } = parsed.data
    const rate = takeRateLimit(`login:${clientIp(request)}:${email}`, 10)
    if (!rate.allowed) return apiError('RATE_LIMITED', 'Too many login attempts. Please try again later.', 429, { retryAfterSeconds: rate.retryAfterSeconds })

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user?.passwordHash) {
      return apiError('UNAUTHORIZED', 'Invalid credentials', 401)
    }

    const isValid = await bcrypt.compare(password, user.passwordHash)
    if (!isValid) {
      return apiError('UNAUTHORIZED', 'Invalid credentials', 401)
    }

    return apiSuccess({
      id: user.id,
      email: user.email,
      name: user.name,
    })
  } catch (error: any) {
    console.error('Login error:', error)
    return apiError('INTERNAL_ERROR', 'Login failed', 500)
  }
}
