export const dynamic = 'force-dynamic'

import { createHash, randomUUID } from 'node:crypto'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { apiError, apiSuccess } from '@/lib/api'
import { healthClaimReportWhere } from '@/lib/account-security'
import { parseHealthClaimFile, type HealthClaimKind } from '@/lib/health-claims'
import { storePrivateFile } from '@/lib/s3'

const MAX_BYTES = 25 * 1024 * 1024
const allowedTypes = new Set(['text/csv', 'application/vnd.ms-excel', 'application/pdf'])

function isImportSchemaError(error: unknown) {
  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && (error.code === 'P2021' || error.code === 'P2022'),
  )
}

function importServiceUnavailable(error: unknown) {
  const diagnosticId = randomUUID()
  console.error('Health claim import database readiness failure', {
    diagnosticId,
    prismaCode: error && typeof error === 'object' && 'code' in error ? error.code : 'unknown',
  })
  return apiError(
    'SERVICE_UNAVAILABLE',
    'Claim imports are temporarily unavailable because the service database is not ready. Try again later or contact support with the diagnostic ID.',
    503,
    { diagnosticId },
  )
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const userId = (session.user as { id?: string }).id
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  try {
    return apiSuccess(await prisma.healthClaimImport.findMany({
      where: healthClaimReportWhere(userId),
      select: {
        id: true, kind: true, fileName: true, contentType: true, byteSize: true, sha256: true,
        status: true, detectedFields: true, parseErrors: true, confirmedAt: true, canceledAt: true,
        deletedAt: true, createdAt: true, updatedAt: true,
        _count: { select: { rows: true } },
      },
      orderBy: { createdAt: 'desc' },
    }))
  } catch (error) {
    if (isImportSchemaError(error)) return importServiceUnavailable(error)
    throw error
  }
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const userId = (session.user as { id?: string }).id
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  let form: { get(name: string): string | File | null }
  try {
    form = await request.formData() as unknown as { get(name: string): string | File | null }
  } catch {
    return apiError('VALIDATION_ERROR', 'Upload must use multipart form data', 400)
  }
  const kind = String(form.get('kind') ?? '')
  if (kind !== 'medicare' && kind !== 'private_health') {
    return apiError('VALIDATION_ERROR', 'Choose Medicare or private health claims', 400)
  }
  const file = form.get('file')
  if (!(file instanceof File)) return apiError('VALIDATION_ERROR', 'A CSV or PDF file is required', 400)
  const fileName = file.name.trim()
  const extension = fileName.split('.').pop()?.toLowerCase()
  const contentType = file.type || (extension === 'pdf' ? 'application/pdf' : extension === 'csv' ? 'text/csv' : '')
  if (!fileName || /[\u0000-\u001f\u007f/\\]/.test(fileName) || !['csv', 'pdf'].includes(extension ?? '') || !allowedTypes.has(contentType)) {
    return apiError('VALIDATION_ERROR', 'Only .csv files and Medicare or machine-readable .pdf files are supported', 400)
  }
  if (!file.size || file.size > MAX_BYTES) return apiError('VALIDATION_ERROR', 'File must be between 1 byte and 25 MB', 400)

  const body = new Uint8Array(await file.arrayBuffer())
  const sha256 = createHash('sha256').update(body).digest('hex')
  let duplicate
  try {
    duplicate = await prisma.healthClaimImport.findUnique({
      where: { userId_sha256: { userId, sha256 } },
      select: { id: true, status: true, fileName: true },
    })
  } catch (error) {
    if (isImportSchemaError(error)) return importServiceUnavailable(error)
    throw error
  }
  if (duplicate) return apiError('CONFLICT', 'This source file has already been imported', 409, { duplicate })

  const parsed = await parseHealthClaimFile(kind as HealthClaimKind, fileName, contentType, Buffer.from(body))
  let storageKey: string | undefined
  try {
    storageKey = await storePrivateFile(userId, 'health-claims', fileName, contentType, body, Buffer.from(sha256, 'hex').toString('base64'))
    const existingFingerprints = new Set<string>()
    if (parsed.rows.length) {
      const fingerprints = parsed.rows.map((row) => row.fingerprint)
      const existing = kind === 'medicare'
        ? await prisma.medicareClaim.findMany({ where: { userId, importFingerprint: { in: fingerprints } }, select: { importFingerprint: true } })
        : await prisma.phiClaim.findMany({ where: { userId, importFingerprint: { in: fingerprints } }, select: { importFingerprint: true } })
      for (const row of existing) if (row.importFingerprint) existingFingerprints.add(row.importFingerprint)
    }
    const status = parsed.rows.length ? 'review' : 'rejected'
    const record = await prisma.healthClaimImport.create({
      data: {
        userId,
        kind: kind as HealthClaimKind,
        fileName,
        contentType,
        byteSize: body.byteLength,
        sha256,
        storageKey,
        status,
        detectedFields: parsed.detectedFields,
        parseErrors: parsed.errors,
        rows: {
          create: parsed.rows.map((row) => ({
            user: { connect: { id: userId } },
            rowNumber: row.rowNumber,
            fingerprint: row.fingerprint,
            data: row.data,
            errors: row.errors,
            status: row.errors.length ? 'invalid' : existingFingerprints.has(row.fingerprint) ? 'duplicate' : 'valid',
          })),
        },
        auditEvents: {
          create: {
            userId,
            actorUserId: userId,
            action: status === 'rejected' ? 'import_rejected' : 'source_uploaded',
          },
        },
      },
      include: {
        rows: { orderBy: { rowNumber: 'asc' } },
        auditEvents: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            action: true,
            rowNumber: true,
            previousStatus: true,
            nextStatus: true,
            changedFields: true,
            actorUserId: true,
            createdAt: true,
            actor: { select: { name: true } },
          },
        },
      },
    })
    return apiSuccess(record, { status: 201 })
  } catch (error) {
    if (storageKey) {
      try {
        const { deleteFile } = await import('@/lib/s3')
        await deleteFile(storageKey)
      } catch {
        // Do not expose storage details or include private payloads in logs.
      }
    }
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      return apiError('CONFLICT', 'This source file has already been imported', 409)
    }
    if (isImportSchemaError(error)) return importServiceUnavailable(error)
    const diagnosticId = randomUUID()
    console.error('Health claim import failed', {
      diagnosticId,
      errorType: error instanceof Error ? error.name : typeof error,
    })
    return apiError('INTERNAL_ERROR', 'The import could not be completed. Try again or contact support with the diagnostic ID.', 500, { diagnosticId })
  }
}
