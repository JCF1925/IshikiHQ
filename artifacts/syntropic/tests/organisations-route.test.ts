import assert from 'node:assert/strict'
import { beforeEach, describe, it, mock } from 'node:test'

const calls = {
  create: [] as Array<Record<string, unknown>>,
  findFirst: [] as Array<Record<string, unknown>>,
  update: [] as Array<Record<string, unknown>>,
}
let practiceExists = true

const prisma = {
  organisation: {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      calls.create.push(data)
      return { id: 'practice-1', ...data }
    },
    findFirst: async (args: Record<string, unknown>) => {
      calls.findFirst.push(args)
      return practiceExists ? { id: 'practice-1', userId: 'owner-1', name: 'Current practice' } : null
    },
    update: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      calls.update.push({ where, data })
      return { id: 'practice-1', userId: 'owner-1', name: 'Updated practice', ...data }
    },
  },
}

const routeSession = { userId: 'owner-1' }
mock.module('@/auth', {
  namedExports: {
    auth: async () => ({ user: { id: routeSession.userId } }),
  },
})
mock.module('@/lib/db', { namedExports: { prisma } })

const collectionRoute = import('../app/api/organisations/route.ts')
const itemRoute = import('../app/api/organisations/[id]/route.ts')

function jsonRequest(body: unknown) {
  return new Request('http://localhost/api/organisations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  calls.create.length = 0
  calls.findFirst.length = 0
  calls.update.length = 0
  practiceExists = true
})

describe('organisation practice routes', () => {
  it('creates practices with trimmed values and clears blank optional details', async () => {
    const { POST } = await collectionRoute
    const response = await POST(jsonRequest({
      name: '  Bayside Medical Centre  ',
      type: 'medical_practice',
      phone: ' 03 9000 0000 ',
      address: ' ',
      website: 'https://example.test',
      medicarePracticeIdentifier: '',
    }))

    assert.equal(response.status, 201)
    assert.deepEqual(calls.create[0], {
      userId: 'owner-1',
      name: 'Bayside Medical Centre',
      type: 'medical_practice',
      address: null,
      phone: '03 9000 0000',
      website: 'https://example.test',
      notes: null,
      medicarePracticeIdentifier: null,
    })
  })

  it('rejects blank practice names without changing the stored practice', async () => {
    const { PATCH } = await itemRoute
    const response = await PATCH(jsonRequest({ name: '   ', phone: '03 9000 0000' }), { params: Promise.resolve({ id: 'practice-1' }) })

    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { error: 'name is required' })
    assert.equal(calls.findFirst.length, 0)
    assert.equal(calls.update.length, 0)
  })

  it('updates only the owned practice row and keeps its stable identity', async () => {
    const { PATCH } = await itemRoute
    const response = await PATCH(jsonRequest({
      name: '  Updated Medical Centre ',
      phone: ' ',
      address: '  10 Example Street ',
      medicarePracticeIdentifier: '  MP-123 ',
    }), { params: Promise.resolve({ id: 'practice-1' }) })

    assert.equal(response.status, 200)
    assert.deepEqual(calls.update[0], {
      where: { id: 'practice-1' },
      data: {
        name: 'Updated Medical Centre',
        address: '10 Example Street',
        phone: null,
        medicarePracticeIdentifier: 'MP-123',
      },
    })
    const result = await response.json()
    assert.equal(result.organisation.id, 'practice-1')
    assert.equal(result.organisation.medicarePracticeIdentifier, 'MP-123')
  })

  it('returns not found instead of reporting success for another or missing practice', async () => {
    practiceExists = false
    const { PATCH } = await itemRoute
    const response = await PATCH(jsonRequest({ phone: '03 9000 0000' }), { params: Promise.resolve({ id: 'missing-practice' }) })

    assert.equal(response.status, 404)
    assert.deepEqual(await response.json(), { error: 'Practice not found' })
    assert.equal(calls.update.length, 0)
  })
})