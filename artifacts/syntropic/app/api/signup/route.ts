export const dynamic = "force-dynamic";
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { apiError, apiSuccess, clientIp, parseBody } from '@/lib/api'
import { signupSchema } from '@/lib/validation'
import { passwordPolicy, takeRateLimit } from '@/lib/security'

export async function POST(request: Request) {
  try {
    const parsed = await parseBody(request, signupSchema)
    if (!parsed.success) return parsed.response
    const { email, password, name } = parsed.data
    const rate = takeRateLimit(`signup:${clientIp(request)}`, 5)
    if (!rate.allowed) return apiError('RATE_LIMITED', 'Too many signup attempts. Please try again later.', 429, { retryAfterSeconds: rate.retryAfterSeconds })
    const policy = passwordPolicy.safeParse(password)
    if (!policy.success) return apiError('VALIDATION_ERROR', policy.error.issues[0].message, 400)

    const existingUser = await prisma.user.findUnique({ where: { email } })
    if (existingUser) {
      return apiError('CONFLICT', 'An account with this email already exists', 409)
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name: name ?? email.split('@')[0],
        theme: 'dark',
        timezone: 'Australia/Sydney',
        currency: 'AUD',
      },
    })

    return apiSuccess({ id: user.id, email: user.email, name: user.name }, { status: 201 })
  } catch (error: any) {
    console.error('Signup error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to create account', 500)
  }
}
