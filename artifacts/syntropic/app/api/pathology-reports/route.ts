export const dynamic = 'force-dynamic'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { apiError, apiSuccess, parseBody } from '@/lib/api'
import { generatePresignedUploadUrl } from '@/lib/s3'
import { reportUploadSchema } from '@/lib/pathology'
import { Prisma } from '@prisma/client'

export async function GET() {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Unauthorized', 401)
  const userId = (session.user as any).id
  return apiSuccess(await prisma.pathologyReport.findMany({
    where: { userId, retentionState: { not: 'deleted' } },
    select: { id: true, fileName: true, contentType: true, byteSize: true, sha256: true, status: true, retentionState: true, extractionVersion: true, extractedData: true, uploadedAt: true, reviewedAt: true },
    orderBy: { uploadedAt: 'desc' },
  }))
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Unauthorized', 401)
  const parsed = await parseBody(request, reportUploadSchema)
  if (!parsed.success) return parsed.response
  const userId = (session.user as any).id
  const duplicate = await prisma.pathologyReport.findUnique({ where: { userId_sha256: { userId, sha256: parsed.data.sha256 } }, select: { id: true, fileName: true, status: true } })
  if (duplicate) return apiError('CONFLICT', 'This report has already been uploaded', 409, { duplicate })
  const safeName = parsed.data.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
  const checksumSha256Base64 = Buffer.from(parsed.data.sha256, 'hex').toString('base64')
  const signed = await generatePresignedUploadUrl(`${userId}/pathology/${safeName}`, parsed.data.contentType, false, { byteSize: parsed.data.byteSize, checksumSha256Base64 })
  try {
    const report = await prisma.pathologyReport.create({
      data: { userId, ...parsed.data, cloudStoragePath: signed.cloud_storage_path, extractionVersion: 'human-assisted-v1', extractedData: {
        report: { title: parsed.data.fileName.replace(/\.[^.]+$/, ''), provider: null, collectedAt: null, reportedAt: null, comments: null },
        panels: [{ id: 'panel-1', name: 'Imported panel', discipline: 'other', comments: null, sourceBox: null, results: [] }],
      }, status: 'uploaded', auditEvents: { create: { userId, action: 'upload_prepared' } } },
      select: { id: true },
    })
    return apiSuccess({ ...report, uploadUrl: signed.uploadUrl, uploadHeaders: { 'x-amz-checksum-sha256': checksumSha256Base64 } }, { status: 201 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return apiError('CONFLICT', 'This report has already been uploaded', 409)
    }
    throw error
  }
}