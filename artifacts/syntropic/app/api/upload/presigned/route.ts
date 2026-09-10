export const dynamic = "force-dynamic";
import { auth } from '@/auth'
import { apiError, apiSuccess, parseBody } from '@/lib/api'
import { takeRateLimit } from '@/lib/security'
import { generatePresignedUploadUrl } from '@/lib/s3'
import { privateUploadSchema } from '@/lib/validation'
import { prisma } from '@/lib/db'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  const parsed = await parseBody(request, privateUploadSchema)
  if (!parsed.success) return parsed.response
  const userId = (session.user as { id?: string }).id
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const rate = takeRateLimit(`upload-presigned:${userId}`, 5)
  if (!rate.allowed) {
    return apiError('RATE_LIMITED', 'Too many upload requests. Please try again later.', 429, {
      retryAfterSeconds: rate.retryAfterSeconds,
    })
  }

  const { fileName, contentType, byteSize, sha256 } = parsed.data
  const checksumSha256Base64 = Buffer.from(sha256, 'hex').toString('base64')
  const result = await generatePresignedUploadUrl(
    `${userId}/generic/${fileName}`,
    contentType,
    false,
    { byteSize, checksumSha256Base64 },
  )
  const upload = await prisma.genericUpload.create({
    data: {
      userId,
      fileName,
      contentType,
      byteSize,
      sha256,
      storageKey: result.cloud_storage_path,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    },
    select: { id: true },
  })
  return apiSuccess({
    ...result,
    uploadId: upload.id,
    uploadHeaders: {
      'content-type': contentType,
      'x-amz-checksum-sha256': checksumSha256Base64,
      'x-amz-server-side-encryption': 'AES256',
    },
    expiresInSeconds: 900,
  })
}
