import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { hashStorageQrToken } from '../lib/household.ts'
import { prisma } from '../lib/db.ts'

/*
 * Database acceptance coverage. Run only against the disposable schema created
 * by scripts/clean-database-acceptance.sh:
 * STORAGE_LABEL_DATABASE_TESTS=1 pnpm exec tsx --test --experimental-test-module-mocks tests/storage-labels-database.test.ts
 */
const databaseTestsEnabled = process.env.STORAGE_LABEL_DATABASE_TESTS === '1'
const routeSession = { userId: '' }

mock.module('@/auth', {
  namedExports: {
    auth: async () => routeSession.userId
      ? { user: { id: routeSession.userId } }
      : null,
  },
})
mock.module('@/lib/db', { namedExports: { prisma } })

const jsonRequest = (url: string, method: string, body?: unknown) => new Request(url, {
  method,
  headers: { 'content-type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
})

describe('storage label revocation database acceptance', { skip: !databaseTestsEnabled }, () => {
  it('stops a revoked label at both scan and print preflight without leaking private details', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const userId = `storage-label-owner-${suffix}`
    const householdId = `storage-label-household-${suffix}`
    const locationId = `storage-label-location-${suffix}`
    const itemId = `storage-label-item-${suffix}`
    const householdName = `storage-label-private-household-${suffix}`
    const itemName = `storage-label-private-item-${suffix}`

    const user = await prisma.user.create({
      data: { id: userId, email: `${userId}@example.test`, name: 'Storage label owner' },
    })
    await prisma.household.create({
      data: { id: householdId, name: householdName, createdById: user.id },
    })
    await prisma.householdMembership.create({
      data: { householdId, userId: user.id, role: 'member' },
    })
    await prisma.householdStorageLocation.create({
      data: { id: locationId, householdId, createdById: user.id, name: 'Private storage location' },
    })
    await prisma.householdStorageItem.create({
      data: {
        id: itemId,
        householdId,
        createdById: user.id,
        locationId,
        name: itemName,
      },
    })

    try {
      const [
        { POST: createLabel },
        { DELETE: revokeLabel },
        { GET: scanLabel },
        { POST: preflight },
      ] = await Promise.all([
        import('../app/api/households/[householdId]/storage/labels/route.ts'),
        import('../app/api/households/[householdId]/storage/labels/[referenceId]/route.ts'),
        import('../app/api/storage/qr/[token]/route.ts'),
        import('../app/api/storage/qr/preflight/route.ts'),
      ])

      routeSession.userId = user.id
      const createdResponse = await createLabel(
        jsonRequest(`http://localhost/api/households/${householdId}/storage/labels`, 'POST', {
          selections: [{ type: 'item', id: item.id, displayText: item.name }],
        }),
        { params: Promise.resolve({ householdId }) },
      )
      assert.equal(createdResponse.status, 201)
      const createdBody = await createdResponse.json() as {
        labels: Array<{ referenceId: string; token: string }>
      }
      assert.equal(createdBody.labels.length, 1)
      const createdLabel = createdBody.labels[0]
      assert.ok(createdLabel)

      const activeScanResponse = await scanLabel(
        new Request(`http://localhost/api/storage/qr/${encodeURIComponent(createdLabel.token)}`),
        { params: Promise.resolve({ token: createdLabel.token }) },
      )
      assert.equal(activeScanResponse.status, 200)

      const revokeResponse = await revokeLabel(
        new Request(`http://localhost/api/households/${householdId}/storage/labels/${createdLabel.referenceId}`, {
          method: 'DELETE',
        }),
        { params: Promise.resolve({ householdId, referenceId: createdLabel.referenceId }) },
      )
      assert.equal(revokeResponse.status, 200)
      assert.deepEqual(await revokeResponse.json(), { revoked: 1 })

      const revokedScanResponse = await scanLabel(
        new Request(`http://localhost/api/storage/qr/${encodeURIComponent(createdLabel.token)}`),
        { params: Promise.resolve({ token: createdLabel.token }) },
      )
      assert.equal(revokedScanResponse.status, 404)
      assert.deepEqual(await revokedScanResponse.json(), { error: 'QR reference not found' })

      const preflightResponse = await preflight(
        jsonRequest('http://localhost/api/storage/qr/preflight', 'POST', {
          tokens: [createdLabel.token],
        }),
      )
      assert.equal(preflightResponse.status, 200)
      const preflightBody = await preflightResponse.json()
      assert.deepEqual(preflightBody, { valid: false, invalidIndexes: [0] })

      const responseText = JSON.stringify({
        scan: { status: revokedScanResponse.status, body: { error: 'QR reference not found' } },
        preflight: preflightBody,
      })
      for (const privateMarker of [
        householdId,
        householdName,
        itemId,
        itemName,
        createdLabel.token,
        hashStorageQrToken(createdLabel.token),
      ]) {
        assert.equal(responseText.includes(privateMarker), false, `private marker exposed: ${privateMarker}`)
      }
    } finally {
      routeSession.userId = ''
      await prisma.household.delete({ where: { id: householdId } })
      await prisma.user.delete({ where: { id: user.id } })
    }
  })
})