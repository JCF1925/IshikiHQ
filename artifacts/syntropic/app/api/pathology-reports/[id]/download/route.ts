export const dynamic = 'force-dynamic'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { apiError, apiSuccess } from '@/lib/api'
import { getFileUrl } from '@/lib/s3'

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Unauthorized', 401)
  const { id } = await context.params
  const report = await prisma.pathologyReport.findFirst({ where: { id, userId: (session.user as any).id, retentionState: 'retained' } })
  if (!report) return apiError('NOT_FOUND', 'Report not found', 404)
  return apiSuccess({ url: await getFileUrl(report.cloudStoragePath, report.contentType, false, 300), expiresIn: 300 })
}