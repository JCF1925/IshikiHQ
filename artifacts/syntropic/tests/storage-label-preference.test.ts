import assert from 'node:assert/strict'
import { beforeEach, describe, it, mock } from 'node:test'

let session: any = { user: { id: 'user-1' } }
let storedLayout: string | null = null
let readable = true
let requiredCapability = ''

class MockHouseholdAccessError extends Error {
  constructor(message = 'Forbidden', readonly status = 403) {
    super(message)
  }
}

mock.module('@/auth', {
  namedExports: { auth: async () => session },
})

mock.module('@/lib/household', {
  namedExports: {
    HouseholdAccessError: MockHouseholdAccessError,
    requireHouseholdCapability: async (_userId: string, _householdId: string, capability: string) => {
      requiredCapability = capability
      if (!readable) throw new MockHouseholdAccessError('unavailable')
      return { role: 'member' }
    },
  },
})

mock.module('@/lib/db', {
  namedExports: {
    prisma: {
      household: {
        findUnique: async () => ({ preferredStorageLabelLayout: storedLayout }),
        update: async ({ data }: { data: { preferredStorageLabelLayout: string } }) => {
          storedLayout = data.preferredStorageLabelLayout
          return { preferredStorageLabelLayout: storedLayout }
        },
      },
    },
  },
})

const route = import('../app/api/households/[householdId]/storage/label-sheet/route.ts')

beforeEach(() => {
  session = { user: { id: 'user-1' } }
  storedLayout = null
  readable = true
  requiredCapability = ''
})

describe('household storage label-sheet preference', () => {
  it('returns plain paper for a new household and reads with household authorization', async () => {
    const { GET } = await route
    const response = await GET(
      new Request('https://example.test/api/households/household-1/storage/label-sheet'),
      { params: Promise.resolve({ householdId: 'household-1' }) },
    )

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { layoutId: 'plain' })
    assert.equal(requiredCapability, 'read')
  })

  it('saves a member choice and returns it to another household session', async () => {
    const { GET, PATCH } = await route
    const saveResponse = await PATCH(
      new Request('https://example.test/api/households/household-1/storage/label-sheet', {
        method: 'PATCH',
        body: JSON.stringify({ layoutId: 'avery-5160' }),
      }),
      { params: Promise.resolve({ householdId: 'household-1' }) },
    )
    assert.equal(saveResponse.status, 200)
    assert.deepEqual(await saveResponse.json(), { layoutId: 'avery-5160' })
    assert.equal(requiredCapability, 'update')

    session = { user: { id: 'user-2' } }
    const readResponse = await GET(
      new Request('https://example.test/api/households/household-1/storage/label-sheet'),
      { params: Promise.resolve({ householdId: 'household-1' }) },
    )
    assert.equal(readResponse.status, 200)
    assert.deepEqual(await readResponse.json(), { layoutId: 'avery-5160' })
  })

  it('falls back to plain paper when a previously saved format is no longer available', async () => {
    storedLayout = 'removed-format'
    const { GET } = await route
    const response = await GET(
      new Request('https://example.test/api/households/household-1/storage/label-sheet'),
      { params: Promise.resolve({ householdId: 'household-1' }) },
    )

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { layoutId: 'plain' })
  })

  it('does not expose or change the preference for an unauthorized session', async () => {
    const { GET, PATCH } = await route
    readable = false
    const readResponse = await GET(
      new Request('https://example.test/api/households/household-1/storage/label-sheet'),
      { params: Promise.resolve({ householdId: 'household-1' }) },
    )
    const updateResponse = await PATCH(
      new Request('https://example.test/api/households/household-1/storage/label-sheet', {
        method: 'PATCH',
        body: JSON.stringify({ layoutId: 'avery-l7160' }),
      }),
      { params: Promise.resolve({ householdId: 'household-1' }) },
    )

    assert.equal(readResponse.status, 403)
    assert.equal(updateResponse.status, 403)
    assert.equal(storedLayout, null)
  })
})