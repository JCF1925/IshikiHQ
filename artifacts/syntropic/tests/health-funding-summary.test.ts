import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { prisma } from '../lib/db.ts'

const databaseTestsEnabled = process.env.HEALTH_FUNDING_SUMMARY_DATABASE_TESTS === '1'
const routeSession = { userId: '' }

mock.module('@/auth', {
  namedExports: {
    auth: async () => routeSession.userId ? { user: { id: routeSession.userId } } : null,
  },
})
mock.module('@/lib/db', { namedExports: { prisma } })

describe('health funding summary contract', () => {
  it('uses the authenticated live-record scope and keeps lifecycle metadata out of the report', async () => {
    const source = await import('node:fs/promises').then((fs) => fs.readFile(
      new URL('../app/api/health-claims/summary/route.ts', import.meta.url),
      'utf8',
    ))
    const client = await import('node:fs/promises').then((fs) => fs.readFile(
      new URL('../app/(app)/health-funding/summary/summary-client.tsx', import.meta.url),
      'utf8',
    ))

    assert.match(source, /auth\(\)/)
    assert.match(source, /healthClaimReportScope/)
    assert.match(source, /scope\.owner/)
    assert.match(source, /scope\.liveImport/)
    assert.doesNotMatch(source, /auditEvents|HealthClaimImportRow|storageKey|sha256|fileName/)
    assert.match(client, /Live records only/)
    assert.match(client, /removed source files/)
    assert.match(client, /\/api\/health-claims\/summary/)
  })
})

describe('health funding summary database acceptance', { skip: !databaseTestsEnabled }, () => {
  it('does not return detached imports, tombstones, audit history, or deleted claim values', async () => {
    const suffix = `${process.pid}-${Date.now()}`
    const user = await prisma.user.create({ data: { email: `health-summary-${suffix}@example.test` } })
    const otherUser = await prisma.user.create({ data: { email: `health-summary-other-${suffix}@example.test` } })
    const liveImport = await prisma.healthClaimImport.create({
      data: {
        userId: user.id,
        kind: 'medicare',
        fileName: 'live-source.csv',
        contentType: 'text/csv',
        byteSize: 10,
        sha256: `a${suffix}`.slice(0, 64).padEnd(64, 'a'),
        storageKey: `private/${user.id}/live-source.csv`,
        status: 'confirmed',
      },
    })
    const detachedImport = await prisma.healthClaimImport.create({
      data: {
        userId: null,
        kind: 'medicare',
        fileName: '[deleted]',
        contentType: 'text/csv',
        byteSize: 10,
        sha256: '[deleted]',
        storageKey: '[deleted]',
        status: 'confirmed',
        deletedAt: new Date(),
      },
    })
    await prisma.healthClaimImportAudit.create({
      data: { importId: detachedImport.id, action: 'source_removed' },
    })
    const liveClaim = await prisma.medicareClaim.create({
      data: {
        userId: user.id,
        serviceDate: new Date('2026-05-01T00:00:00.000Z'),
        description: 'Live Medicare consultation',
        benefitPaid: 70,
        outOfPocket: 30,
        sourceImportId: liveImport.id,
        importFingerprint: `live-${suffix}`,
      },
    })
    const hiddenClaim = await prisma.medicareClaim.create({
      data: {
        userId: otherUser.id,
        serviceDate: new Date('2026-05-02T00:00:00.000Z'),
        description: 'Other account hidden claim',
        benefitPaid: 99,
        outOfPocket: 1,
        sourceImportId: detachedImport.id,
        importFingerprint: `hidden-${suffix}`,
      },
    })

    try {
      routeSession.userId = user.id
      const { GET } = await import('../app/api/health-claims/summary/route.ts')
      const response = await GET(new Request('http://health-summary.test/api/health-claims/summary?year=2026'))
      assert.equal(response.status, 200)
      const body = await response.json()
      assert.equal(body.scope, 'live')
      assert.equal(body.medicare.claimCount, 1)
      assert.equal(body.medicare.recentClaims[0].id, liveClaim.id)
      assert.equal(JSON.stringify(body).includes(hiddenClaim.id), false)
      assert.equal(JSON.stringify(body).includes('Other account hidden claim'), false)
      assert.equal(JSON.stringify(body).includes('source_removed'), false)
      assert.equal(JSON.stringify(body).includes('[deleted]'), false)
    } finally {
      routeSession.userId = ''
      await prisma.medicareClaim.deleteMany({ where: { id: { in: [liveClaim.id, hiddenClaim.id] } } })
      await prisma.healthClaimImportAudit.deleteMany({ where: { importId: detachedImport.id } })
      await prisma.healthClaimImport.deleteMany({ where: { id: { in: [liveImport.id, detachedImport.id] } } })
      await prisma.user.deleteMany({ where: { id: { in: [user.id, otherUser.id] } } })
    }
  })
})