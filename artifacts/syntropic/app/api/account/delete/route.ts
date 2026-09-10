export const dynamic = 'force-dynamic'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { apiError, apiSuccess, parseBody } from '@/lib/api'
import { deleteAccountSchema } from '@/lib/validation'
import { accountFingerprint, hasRecentAuthentication } from '@/lib/account-security'
import { deleteFile } from '@/lib/s3'
import { Prisma } from '@prisma/client'

const SAFE_HEALTH_CLAIM_FIELDS = new Set([
  'claimNumber',
  'serviceDate',
  'description',
  'itemNumber',
  'provider',
  'scheduleFee',
  'feeCharged',
  'chargedAmount',
  'benefitPaid',
  'benefitAmount',
  'outOfPocket',
  'financialYear',
  'isForecast',
  'countsToSafetyNet',
  'serviceType',
  'benefitDetail',
  'claimStatus',
])

function isSafeHealthClaimAuditMetadata(value: unknown) {
  if (value == null || value === true) return true
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && SAFE_HEALTH_CLAIM_FIELDS.has(item))
}

// The database's existing cascading relations perform an all-or-nothing deletion. The
// required literal confirmation avoids accidental destructive requests; callers should
// offer export before invoking this endpoint.
export async function DELETE(request: Request) {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const parsed = await parseBody(request, deleteAccountSchema)
  if (!parsed.success) return parsed.response
  const userId = (session.user as any).id as string
  if (!hasRecentAuthentication(session.authTime)) {
    return apiError('FORBIDDEN', 'Recent authentication required. Sign in again before deleting your account.', 403)
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
  if (!user) return apiError('NOT_FOUND', 'Account not found', 404)
  const audit = await prisma.accountSecurityAudit.create({
    data: { actorUserId: userId, accountFingerprint: accountFingerprint(userId), action: 'account_deletion', status: 'started' },
    select: { id: true },
  })

  const [membershipCount, ownedHouseholdCount] = await Promise.all([
    prisma.householdMembership.count({ where: { userId, removedAt: null } }),
    prisma.household.count({ where: { createdById: userId } }),
  ])
  if (membershipCount || ownedHouseholdCount) {
    await prisma.accountSecurityAudit.update({
      where: { id: audit.id },
      data: {
        status: 'blocked',
        completedAt: new Date(),
        metadata: { reason: 'household_dependencies', membershipCount, ownedHouseholdCount },
      },
    })
    return apiError(
      'CONFLICT',
      'Account deletion is blocked until household memberships are left and owned households are transferred or removed.',
      409,
    )
  }

  const [transactions, reports, panels, mobileUploads, genericUploads, healthClaimImports, healthClaimAuditEvents] = await Promise.all([
    prisma.transaction.findMany({ where: { userId, receiptPath: { not: null } }, select: { receiptPath: true } }),
    prisma.pathologyReport.findMany({ where: { userId }, select: { cloudStoragePath: true } }),
    prisma.labPanel.findMany({ where: { userId, cloudStoragePath: { not: null } }, select: { cloudStoragePath: true } }),
    prisma.mobileUpload.findMany({ where: { userId }, select: { storageKey: true } }),
    prisma.genericUpload.findMany({ where: { userId }, select: { storageKey: true } }),
    prisma.healthClaimImport.findMany({ where: { userId }, select: { id: true, storageKey: true } }),
    prisma.healthClaimImportAudit.findMany({
      where: { OR: [{ userId }, { actorUserId: userId }] },
      select: { changedFields: true },
    }),
  ])
  if (healthClaimAuditEvents.some((event) => !isSafeHealthClaimAuditMetadata(event.changedFields))) {
    await prisma.accountSecurityAudit.update({
      where: { id: audit.id },
      data: { status: 'failed', completedAt: new Date(), metadata: { phase: 'health_claim_metadata_validation' } },
    }).catch(() => undefined)
    return apiError('CONFLICT', 'Account deletion is blocked because health-claim audit metadata contains private claim data.', 409)
  }
  const objectKeys = new Set<string>([
    ...transactions.flatMap((item) => item.receiptPath ? [item.receiptPath] : []),
    ...reports.map((item) => item.cloudStoragePath),
    ...panels.flatMap((item) => item.cloudStoragePath ? [item.cloudStoragePath] : []),
    ...mobileUploads.map((item) => item.storageKey),
    ...genericUploads.map((item) => item.storageKey),
    ...healthClaimImports.map((item) => item.storageKey),
  ])
  const healthClaimImportIds = healthClaimImports.map((item) => item.id)

  try {
    for (const key of objectKeys) await deleteFile(key)
  } catch {
    await prisma.accountSecurityAudit.update({
      where: { id: audit.id },
      data: { status: 'failed', completedAt: new Date(), metadata: { phase: 'object_cleanup' } },
    }).catch(() => undefined)
    return apiError('INTERNAL_ERROR', 'Account deletion failed during private file cleanup; no database records were deleted.', 503)
  }

  const deletedAt = new Date()
  try {
    await prisma.$transaction(async (tx) => {
      // These append-only Apple Health records use restrictive foreign keys by design,
      // so deletion is explicit and ordered rather than relying on an opaque cascade.
      await tx.appleHealthAuditRecord.deleteMany({ where: { userId } })
      await tx.appleHealthAnchor.deleteMany({ where: { userId } })
      await tx.appleHealthDeletion.deleteMany({ where: { userId } })
      await tx.appleHealthSample.deleteMany({ where: { userId } })
      await tx.appleHealthImportBatch.deleteMany({ where: { userId } })
      // Claim values are private data and must not survive account deletion. Keep only
      // an ownership-detached import tombstone and its metadata-only audit history.
      await tx.healthClaimImportRow.deleteMany({
        where: {
          OR: [
            { userId },
            ...(healthClaimImportIds.length > 0 ? [{ importId: { in: healthClaimImportIds } }] : []),
          ],
        },
      })
      await tx.$executeRaw`SELECT set_config('app.health_claim_account_deletion', 'on', true)`
      await tx.healthClaimImportAudit.updateMany({
        where: { OR: [{ userId }, { actorUserId: userId }, { import: { userId } }] },
        data: { userId: null, actorUserId: null },
      })
      await tx.healthClaimImport.updateMany({
        where: { userId },
        data: {
          userId: null,
          deletedAt,
          fileName: '[deleted]',
          sha256: '[deleted]',
          detectedFields: Prisma.JsonNull,
          parseErrors: Prisma.JsonNull,
          storageKey: '[deleted]',
        },
      })
      await tx.accountSecurityAudit.update({
        where: { id: audit.id },
        data: {
          status: 'completed',
          completedAt: deletedAt,
          metadata: { privateObjectsDeleted: objectKeys.size, strategy: 'ordered_cleanup_then_cascade' },
        },
      })
      await tx.user.delete({ where: { id: userId } })
    })
  } catch (error) {
    await prisma.accountSecurityAudit.update({
      where: { id: audit.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        metadata: {
          phase: 'database_cleanup',
          constraintFailure: error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003',
        },
      },
    }).catch(() => undefined)
    return apiError(
      'CONFLICT',
      'Account deletion could not complete because retained or shared records still depend on this account. No database records were deleted; private files identified for deletion may already have been removed.',
      409,
    )
  }
  return apiSuccess({ deleted: true, deletedAt: deletedAt.toISOString(), auditId: audit.id })
}