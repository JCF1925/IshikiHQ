export const dynamic = 'force-dynamic'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { apiError } from '@/lib/api'
import { accountFingerprint, collectPortableAccountData } from '@/lib/account-security'

// A portable, authenticated data-export baseline. OAuth tokens and password hashes are
// intentionally excluded; exports are sensitive and should only be delivered over HTTPS.
export async function GET() {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const userId = (session.user as any).id as string
  const exportedAt = new Date()
  const audit = await prisma.accountSecurityAudit.create({
    data: { actorUserId: userId, accountFingerprint: accountFingerprint(userId), action: 'account_export', status: 'started' },
    select: { id: true },
  })
  let data
  try {
    data = await collectPortableAccountData(userId)
    await prisma.accountSecurityAudit.update({
      where: { id: audit.id },
      data: { status: 'completed', completedAt: new Date() },
    })
  } catch (error) {
    await prisma.accountSecurityAudit.update({
      where: { id: audit.id },
      data: { status: 'failed', completedAt: new Date() },
    }).catch(() => undefined)
    throw error
  }
  const filename = `ishiki-export-${new Date().toISOString().slice(0, 10)}.json`
  return new Response(JSON.stringify({
    format: 'syntropic-backup/v2',
    exportedAt: exportedAt.toISOString(),
    auditId: audit.id,
    ...data,
  }, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}