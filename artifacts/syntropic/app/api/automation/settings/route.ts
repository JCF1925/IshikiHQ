export const dynamic = 'force-dynamic'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { apiError, apiSuccess } from '@/lib/api'

export async function GET() {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const userId = (session.user as any).id
  const settings = await prisma.automationSetting.findUnique({ where: { userId } })
  return apiSuccess({ categoryAutoApplyThreshold: settings?.categoryAutoApplyThreshold ?? 0.9 })
}

export async function PUT(request: Request) {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const userId = (session.user as any).id
  const value = Number((await request.json()).categoryAutoApplyThreshold)
  if (!Number.isFinite(value) || value < 0 || value > 1) return apiError('VALIDATION_ERROR', 'Threshold must be between 0 and 1', 400)
  const settings = await prisma.automationSetting.upsert({
    where: { userId }, create: { userId, categoryAutoApplyThreshold: value },
    update: { categoryAutoApplyThreshold: value },
  })
  return apiSuccess({ categoryAutoApplyThreshold: settings.categoryAutoApplyThreshold })
}