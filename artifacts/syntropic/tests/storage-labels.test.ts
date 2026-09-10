import assert from 'node:assert/strict'
import { beforeEach, describe, it, mock } from 'node:test'

let session: any = { user: { id: 'user-1' } }
let readable = true
let tokenSequence = 0
const createdReferences: any[] = []
const auditRecords: any[] = []
let availableItems = [{ id: 'item-1' }]
let availableContainers = [{ id: 'container-1' }]
let knownReferences: { tokenHash: string; householdId: string }[] = []
let listedReferences: any[] = []
class MockHouseholdAccessError extends Error {
  status = 403
}
const existingReference = {
  id: 'reference-existing',
  householdId: 'household-1',
  itemId: 'item-1',
  containerId: null,
  createdById: 'user-1',
  tokenHash: 'hash:existing-token',
  createdAt: new Date('2026-09-10T01:02:03.000Z'),
  item: { name: 'Camping stove' },
  container: null,
}

mock.module('@/auth', {
  namedExports: { auth: async () => session },
})

mock.module('@/lib/household', {
  namedExports: {
    HouseholdAccessError: MockHouseholdAccessError,
    createStorageQrToken: () => {
      tokenSequence += 1
      return { token: `opaque-${tokenSequence}`, tokenHash: `hash:opaque-${tokenSequence}` }
    },
    hashStorageQrToken: (token: string) => `hash:${token}`,
    requireHouseholdCapability: async () => {
      if (!readable) throw new MockHouseholdAccessError('unavailable')
      return { role: 'member' }
    },
    storageQrPath: (token: string) => `/storage/qr/${encodeURIComponent(token)}`,
  },
})

const transactionClient = {
  householdStorageQrReference: {
    create: async ({ data }: any) => {
      const reference = { id: `reference-${createdReferences.length + 1}`, ...data }
      createdReferences.push(reference)
      return reference
    },
      delete: async ({ where }: any) => ({ id: where.id }),
  },
  householdAuditRecord: {
    create: async ({ data }: any) => {
      auditRecords.push(data)
      return data
    },
  },
}

mock.module('@/lib/db', {
  namedExports: {
    prisma: {
      householdStorageItem: { findMany: async () => availableItems },
      householdStorageContainer: { findMany: async () => availableContainers },
      householdStorageQrReference: {
        findMany: async ({ where }: any) => 'tokenHash' in where
          ? knownReferences.filter(({ tokenHash }) => where.tokenHash.in.includes(tokenHash))
          : listedReferences,
        findFirst: async ({ where }: any) => where.id === existingReference.id && where.householdId === existingReference.householdId
          ? existingReference
          : null,
      },
      $transaction: async (operation: any) => operation(transactionClient),
    },
  },
})

const batchRoute = import('../app/api/households/[householdId]/storage/labels/route.ts')
const preflightRoute = import('../app/api/storage/qr/preflight/route.ts')

beforeEach(() => {
  session = { user: { id: 'user-1' } }
  readable = true
  tokenSequence = 0
  createdReferences.length = 0
  auditRecords.length = 0
  availableItems = [{ id: 'item-1' }]
  availableContainers = [{ id: 'container-1' }]
  knownReferences = []
  listedReferences = [existingReference]
})

describe('storage label batch authorization', () => {
  it('rejects a mixed-household selection before creating any references', async () => {
    const { POST } = await batchRoute
    const response = await POST(
      new Request('https://example.test/api/labels', {
        method: 'POST',
        body: JSON.stringify({
          selections: [
            { type: 'item', id: 'item-1', displayText: 'Camping stove' },
            { type: 'container', id: 'other-household-container', displayText: 'Camping bin' },
          ],
        }),
      }),
      { params: Promise.resolve({ householdId: 'household-1' }) },
    )

    assert.equal(response.status, 409)
    assert.equal(createdReferences.length, 0)
    assert.deepEqual(await response.json(), {
      error: 'Some selected storage records are missing or unavailable',
      invalid: [{ type: 'container', id: 'other-household-container' }],
    })
  })

  it('creates one opaque, independently revocable reference per authorized selection', async () => {
    const { POST } = await batchRoute
    const response = await POST(
      new Request('https://example.test/api/labels', {
        method: 'POST',
        body: JSON.stringify({
          selections: [
            { type: 'item', id: 'item-1', displayText: 'Stove' },
            { type: 'container', id: 'container-1', displayText: 'Camping' },
          ],
        }),
      }),
      { params: Promise.resolve({ householdId: 'household-1' }) },
    )

    const body = await response.json()
    assert.equal(response.status, 201)
    assert.equal(createdReferences.length, 2)
    assert.equal(new Set(createdReferences.map(({ tokenHash }) => tokenHash)).size, 2)
    assert.deepEqual(createdReferences.map(({ itemId, containerId }) => ({ itemId, containerId })), [
      { itemId: 'item-1', containerId: null },
      { itemId: null, containerId: 'container-1' },
    ])
    assert.deepEqual(body.labels.map(({ displayText, path }: any) => ({ displayText, path })), [
      { displayText: 'Stove', path: '/storage/qr/opaque-1' },
      { displayText: 'Camping', path: '/storage/qr/opaque-2' },
    ])
    assert.equal(auditRecords.length, 2)
  })

  it('lists active references with safe resource metadata instead of token material', async () => {
    const { GET } = await import('../app/api/households/[householdId]/storage/labels/route.ts')
    const response = await GET(
      new Request('https://example.test/api/labels'),
      { params: Promise.resolve({ householdId: 'household-1' }) },
    )
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.deepEqual(body.labels, [{
      referenceId: 'reference-existing',
      type: 'item',
      resourceId: 'item-1',
      resourceName: 'Camping stove',
      createdAt: '2026-09-10T01:02:03.000Z',
    }])
    assert.equal(JSON.stringify(body).includes('tokenHash'), false)
    assert.equal(JSON.stringify(body).includes('existing-token'), false)
  })

  it('creates a fresh independently revocable reference when reprinting one label', async () => {
    const { POST } = await import('../app/api/households/[householdId]/storage/labels/[referenceId]/route.ts')
    const response = await POST(
      new Request('https://example.test/api/labels/reference-existing', { method: 'POST' }),
      { params: Promise.resolve({ householdId: 'household-1', referenceId: 'reference-existing' }) },
    )
    const body = await response.json()

    assert.equal(response.status, 201)
    assert.deepEqual(body.label, {
      referenceId: 'reference-1',
      type: 'item',
      resourceId: 'item-1',
      displayText: 'Camping stove',
      token: 'opaque-1',
      path: '/storage/qr/opaque-1',
    })
    assert.deepEqual(createdReferences[0], {
      id: 'reference-1',
      householdId: 'household-1',
      itemId: 'item-1',
      containerId: null,
      createdById: 'user-1',
      tokenHash: 'hash:opaque-1',
    })
    assert.deepEqual(auditRecords[0].metadata, {
      resourceType: 'item',
      resourceId: 'item-1',
      reprintOf: 'reference-existing',
    })
  })

  it('does not disclose the active list to a removed household member', async () => {
    readable = false
    const { GET } = await import('../app/api/households/[householdId]/storage/labels/route.ts')
    const response = await GET(
      new Request('https://example.test/api/labels'),
      { params: Promise.resolve({ householdId: 'household-1' }) },
    )

    assert.equal(response.status, 403)
    assert.deepEqual(await response.json(), { error: 'unavailable' })
  })

  it('preflight reports missing, revoked, and unauthorized tokens without inventory data', async () => {
    knownReferences = [
      { tokenHash: 'hash:valid-token', householdId: 'household-1' },
      { tokenHash: 'hash:other-household-token', householdId: 'household-2' },
    ]
    readable = false
    const { POST } = await preflightRoute
    const response = await POST(new Request('https://example.test/api/storage/qr/preflight', {
      method: 'POST',
      body: JSON.stringify({ tokens: ['valid-token', 'revoked-token', 'other-household-token'] }),
    }))
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.deepEqual(body, { valid: false, invalidIndexes: [0, 1, 2] })
    assert.equal(JSON.stringify(body).includes('household-'), false)
    assert.equal(JSON.stringify(body).includes('item'), false)
    assert.equal(JSON.stringify(body).includes('container'), false)
  })

  it('requires authentication before selection or token lookup', async () => {
    session = null
    const [{ POST: createLabels }, { POST: preflight }, { GET: listLabels }, { POST: reprintLabel }] = await Promise.all([
      batchRoute,
      preflightRoute,
      import('../app/api/households/[householdId]/storage/labels/route.ts'),
      import('../app/api/households/[householdId]/storage/labels/[referenceId]/route.ts'),
    ])
    const createResponse = await createLabels(
      new Request('https://example.test/api/labels', { method: 'POST', body: JSON.stringify({ selections: [] }) }),
      { params: Promise.resolve({ householdId: 'household-1' }) },
    )
    const preflightResponse = await preflight(
      new Request('https://example.test/api/preflight', { method: 'POST', body: JSON.stringify({ tokens: ['unknown'] }) }),
    )
    assert.equal(createResponse.status, 401)
    assert.equal(preflightResponse.status, 401)
    assert.equal((await listLabels(
      new Request('https://example.test/api/labels'),
      { params: Promise.resolve({ householdId: 'household-1' }) },
    )).status, 401)
    assert.equal((await reprintLabel(
      new Request('https://example.test/api/labels/reference-existing', { method: 'POST' }),
      { params: Promise.resolve({ householdId: 'household-1', referenceId: 'reference-existing' }) },
    )).status, 401)
  })
})