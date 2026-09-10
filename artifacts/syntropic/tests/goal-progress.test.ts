import assert from 'node:assert/strict'
import { beforeEach, describe, it, mock } from 'node:test'
import {
  goalCreateSchema,
  goalProgressEntryDeleteSchema,
  goalProgressEntryUpdateSchema,
  goalUpdateSchema,
} from '../lib/validation.ts'

const calls = {
  goalCreates: [] as any[],
  goalUpdates: [] as any[],
  goalDeletes: [] as any[],
  projectUpdates: [] as any[],
  progressCreates: [] as any[],
  progressUpdates: [] as any[],
  progressDeletes: [] as any[],
  goalFinds: [] as any[],
  goalFindMany: [] as any[],
  historyFindMany: [] as any[],
  historyCounts: [] as any[],
}

const auth = async () => ({ user: { id: 'owner-1' } })
let progressEntryExists = true
let nextProgressValue = 2
const tx = {
  goal: {
    create: async ({ data }: any) => {
      calls.goalCreates.push(data)
      return { id: 'goal-1', ...data }
    },
    updateMany: async (args: any) => {
      calls.goalUpdates.push(args)
      return { count: 1 }
    },
    deleteMany: async (args: any) => {
      calls.goalDeletes.push(args)
      return { count: 1 }
    },
    findFirst: async (args: any) => {
      calls.goalFinds.push(args)
      if (args.select) return { currentValue: 2, targetValue: 10 }
      return { id: 'goal-1', userId: 'owner-1', currentValue: 4, targetValue: 10, progressEntries: [] }
    },
    findUniqueOrThrow: async (args: any) => {
      calls.goalFinds.push(args)
      return { id: 'goal-1', userId: 'owner-1', progressEntries: [] }
    },
  },
  goalProgressEntry: {
    create: async ({ data }: any) => {
      calls.progressCreates.push(data)
      return { id: 'progress-1', ...data }
    },
    findFirst: async (args: any) => {
      if (!progressEntryExists) return null
      if (args.orderBy) return { value: nextProgressValue }
      return { id: 'progress-1', value: 4, recordedAt: new Date('2026-09-08') }
    },
    update: async (args: any) => {
      calls.progressUpdates.push(args)
      if (args.data.value !== undefined) nextProgressValue = args.data.value
      return { id: 'progress-1', ...args.data }
    },
    delete: async (args: any) => {
      calls.progressDeletes.push(args)
      return { id: 'progress-1' }
    },
  },
  project: {
    updateMany: async (args: any) => {
      calls.projectUpdates.push(args)
      return { count: 1 }
    },
  },
}
const prisma = {
  goal: {
    findMany: async (args: any) => {
      calls.goalFindMany.push(args)
      return [{
        id: 'goal-1',
        userId: 'owner-1',
        progressEntries: [{ id: 'recent-1' }],
        _count: { progressEntries: 125 },
      }]
    },
    findFirst: async (args: any) => {
      calls.goalFinds.push(args)
      if (args.include) return { id: 'goal-1', userId: 'owner-1', title: 'Read 125 books', unit: 'books', projects: [] }
      return { currentValue: 2, targetValue: 10 }
    },
    deleteMany: async (args: any) => {
      calls.goalDeletes.push(args)
      return { count: 1 }
    },
  },
  project: {
    updateMany: async (args: any) => {
      calls.projectUpdates.push(args)
      return { count: 1 }
    },
  },
  goalProgressEntry: {
    findMany: async (args: any) => {
      calls.historyFindMany.push(args)
      return [{ id: 'entry-5', value: 5, recordedAt: new Date('2026-09-05') }]
    },
    count: async (args: any) => {
      calls.historyCounts.push(args)
      return 125
    },
  },
  $transaction: async (operation: (client: typeof tx) => unknown) => operation(tx),
}

mock.module('@/auth', { namedExports: { auth } })
mock.module('@/lib/db', { namedExports: { prisma } })

const collectionRoute = import('../app/api/goals/route.ts')
const itemRoute = import('../app/api/goals/[id]/route.ts')

beforeEach(() => {
  for (const value of Object.values(calls)) value.length = 0
})

describe('goal progress validation', () => {
  it('accepts legacy milestones while adding normalized completion metadata', () => {
    const parsed = goalCreateSchema.safeParse({
      title: 'Run 5 km',
      category: 'health',
      targetValue: 5,
      currentValue: 1,
      status: 'active',
      milestones: [{ id: 'first-run', text: 'Run one kilometre', done: false }],
    })
    assert.equal(parsed.success, true)
    if (parsed.success) {
      assert.equal(parsed.data.milestones[0]?.dueDate, undefined)
      assert.equal(parsed.data.milestones[0]?.completedAt, null)
    }
  })

  it('rejects invalid milestone dates and unknown milestone fields', () => {
    assert.equal(goalUpdateSchema.safeParse({
      milestones: [{ id: 'm1', text: 'Milestone', done: false, dueDate: 'not-a-date' }],
    }).success, false)
    assert.equal(goalUpdateSchema.safeParse({
      milestones: [{ id: 'm1', text: 'Milestone', done: false, hiddenOwner: 'other-user' }],
    }).success, false)
  })

  it('preserves an explicit null so users can clear a measurable target', () => {
    const parsed = goalUpdateSchema.safeParse({ targetValue: null })
    assert.equal(parsed.success, true)
    if (parsed.success) assert.equal(parsed.data.targetValue, null)
  })

  it('requires explicit confirmation for progress corrections and removal', () => {
    assert.equal(goalProgressEntryUpdateSchema.safeParse({ value: 5, recordedAt: '2026-09-10' }).success, false)
    assert.equal(goalProgressEntryDeleteSchema.safeParse({ confirmed: false }).success, false)
    assert.equal(goalProgressEntryUpdateSchema.safeParse({
      value: 5,
      recordedAt: '2026-09-10',
      confirmed: true,
    }).success, true)
  })
})

describe('goal progress lifecycle routes', () => {
  it('keeps the collection response to a recent summary while returning the full count', async () => {
    const { GET } = await collectionRoute
    const response = await GET()
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.deepEqual(calls.goalFindMany[0]?.include.progressEntries, {
      take: 5,
      orderBy: [
        { recordedAt: 'desc' },
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
    })
    assert.deepEqual(calls.goalFindMany[0]?.include._count, { select: { progressEntries: true } })
    assert.equal(body[0].progressEntries.length, 1)
    assert.equal(body[0]._count.progressEntries, 125)
  })

  it('pages large history in a deterministic owner-scoped order', async () => {
    const { GET } = await itemRoute
    const response = await GET(new Request('http://goals.test/api/goals/goal-1?page=3&pageSize=2'), {
      params: Promise.resolve({ id: 'goal-1' }),
    })
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.deepEqual(calls.goalFinds[0]?.where, { id: 'goal-1', userId: 'owner-1' })
    assert.deepEqual(calls.historyFindMany[0], {
      where: { goalId: 'goal-1', userId: 'owner-1' },
      orderBy: [
        { recordedAt: 'desc' },
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
      skip: 4,
      take: 2,
    })
    assert.deepEqual(calls.historyCounts[0], { where: { goalId: 'goal-1', userId: 'owner-1' } })
    assert.deepEqual(body.pagination, {
      page: 3,
      pageSize: 2,
      totalEntries: 125,
      totalPages: 63,
      hasPreviousPage: true,
      hasNextPage: true,
    })
    assert.equal(body.progressEntryCount, 125)
    assert.equal(body.progressEntries[0].id, 'entry-5')
  })

  it('creates an owner-scoped baseline for a measurable goal', async () => {
    const { POST } = await collectionRoute
    const response = await POST(new Request('http://goals.test/api/goals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Read 12 books',
        category: 'personal',
        targetValue: 12,
        currentValue: 3,
        progressDate: '2026-09-01',
        status: 'active',
        milestones: [],
      }),
    }))

    assert.equal(response.status, 201)
    assert.deepEqual(calls.progressCreates[0], {
      userId: 'owner-1',
      goalId: 'goal-1',
      value: 3,
      recordedAt: new Date('2026-09-01'),
    })
  })

  it('appends dated history only when the measurable value changes', async () => {
    const { PATCH } = await itemRoute
    const changed = await PATCH(new Request('http://goals.test/api/goals/goal-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ currentValue: 4, progressDate: '2026-09-08' }),
    }), { params: Promise.resolve({ id: 'goal-1' }) })

    assert.equal(changed.status, 200)
    assert.deepEqual(calls.goalUpdates[0]?.where, { id: 'goal-1', userId: 'owner-1' })
    assert.deepEqual(calls.progressCreates[0], {
      userId: 'owner-1',
      goalId: 'goal-1',
      value: 4,
      recordedAt: new Date('2026-09-08'),
    })
    assert.deepEqual(calls.goalFinds.at(-1)?.include.progressEntries.orderBy, [
      { recordedAt: 'desc' },
      { createdAt: 'desc' },
      { id: 'desc' },
    ])

    calls.progressCreates.length = 0
    await PATCH(new Request('http://goals.test/api/goals/goal-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ currentValue: 2 }),
    }), { params: Promise.resolve({ id: 'goal-1' }) })
    assert.equal(calls.progressCreates.length, 0)
  })

  it('clears a measurable target instead of silently retaining it', async () => {
    const { PATCH } = await itemRoute
    await PATCH(new Request('http://goals.test/api/goals/goal-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ targetValue: null }),
    }), { params: Promise.resolve({ id: 'goal-1' }) })

    assert.equal(calls.goalUpdates[0]?.data.targetValue, null)
    assert.equal(calls.progressCreates.length, 0)
  })

  it('unlinks only owned projects and deletes only the owned goal', async () => {
    const { DELETE } = await itemRoute
    const response = await DELETE(new Request('http://goals.test/api/goals/goal-1', {
      method: 'DELETE',
    }), { params: Promise.resolve({ id: 'goal-1' }) })

    assert.equal(response.status, 200)
    assert.deepEqual(calls.projectUpdates[0], {
      where: { goalId: 'goal-1', userId: 'owner-1' },
      data: { goalId: null },
    })
    assert.deepEqual(calls.goalDeletes[0], { where: { id: 'goal-1', userId: 'owner-1' } })
  })

  it('corrects an owned progress entry and keeps the goal current value aligned', async () => {
    const { PATCH } = await import('../app/api/goals/[id]/progress/[entryId]/route.ts')
    nextProgressValue = 2
    const response = await PATCH(new Request('http://goals.test/api/goals/goal-1/progress/progress-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 7, recordedAt: '2026-09-10', confirmed: true }),
    }), { params: Promise.resolve({ id: 'goal-1', entryId: 'progress-1' }) })

    assert.equal(response.status, 200)
    assert.deepEqual(calls.progressUpdates[0], {
      where: { id: 'progress-1' },
      data: { value: 7, recordedAt: new Date('2026-09-10') },
    })
    assert.deepEqual(calls.goalUpdates.at(-1), {
      where: { id: 'goal-1', userId: 'owner-1' },
      data: { currentValue: 7 },
    })
  })

  it('removes an owned progress entry and falls back to the newest remaining value', async () => {
    const { DELETE } = await import('../app/api/goals/[id]/progress/[entryId]/route.ts')
    nextProgressValue = 3
    const response = await DELETE(new Request('http://goals.test/api/goals/goal-1/progress/progress-1', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirmed: true }),
    }), { params: Promise.resolve({ id: 'goal-1', entryId: 'progress-1' }) })

    assert.equal(response.status, 200)
    assert.deepEqual(calls.progressDeletes[0], { where: { id: 'progress-1' } })
    assert.deepEqual(calls.goalUpdates.at(-1)?.data, { currentValue: 3 })
  })

  it('cannot correct an entry outside the requested owner and goal', async () => {
    const { PATCH } = await import('../app/api/goals/[id]/progress/[entryId]/route.ts')
    progressEntryExists = false
    const response = await PATCH(new Request('http://goals.test/api/goals/other-goal/progress/other-entry', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 9, confirmed: true }),
    }), { params: Promise.resolve({ id: 'other-goal', entryId: 'other-entry' }) })

    assert.equal(response.status, 404)
    assert.equal(calls.progressUpdates.length, 0)
    progressEntryExists = true
  })
})