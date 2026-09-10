import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { prisma } from '../lib/db.ts'

/* Database acceptance coverage. Enable only against the disposable schema
 * created by scripts/run-dashboard-release-gate.sh. */
const databaseTestsEnabled = process.env.DASHBOARD_API_DATABASE_TESTS === '1'
const routeSession = { userId: '' }

mock.module('@/auth', {
  namedExports: {
    auth: async () => routeSession.userId
      ? { user: { id: routeSession.userId } }
      : null,
  },
})
mock.module('@/lib/db', { namedExports: { prisma } })

type DashboardResponse = {
  todaySchedules?: unknown
  recentTransactions?: unknown
  upcomingTasks?: unknown
  accounts?: unknown
  upcomingEvents?: Array<{ id?: string; title?: string }>
  lowStock?: unknown
  stats?: {
    totalBalance?: unknown
    tasksDueToday?: unknown
    lowStockCount?: unknown
  }
}

describe('dashboard API database acceptance', { skip: !databaseTestsEnabled }, () => {
  it('returns every required dashboard section for the authenticated release account', async () => {
    const releaseAccount = await prisma.user.findUnique({
      where: { email: 'abacus-e9442339@example.com' },
      select: { id: true },
    })
    assert.ok(releaseAccount, 'safe seed must create the release account')
    routeSession.userId = releaseAccount.id

    const eventId = `dashboard-api-acceptance-${Date.now()}`
    await prisma.event.create({
      data: {
        id: eventId,
        userId: releaseAccount.id,
        title: 'Dashboard API acceptance event',
        type: 'personal',
        startDatetime: new Date(Date.now() + 60 * 60 * 1000),
        endDatetime: new Date(Date.now() + 90 * 60 * 1000),
      },
    })

    const { GET } = await import('../app/api/dashboard/route.ts')
    const response = await GET()
    assert.equal(response.status, 200)

    const body = await response.json() as DashboardResponse
    for (const section of [
      'todaySchedules',
      'recentTransactions',
      'upcomingTasks',
      'accounts',
      'upcomingEvents',
      'lowStock',
    ] as const) {
      assert.ok(Array.isArray(body[section]), `${section} must be an array`)
    }
    assert.ok(
      body.upcomingEvents?.some((event) => event.id === eventId),
      'the authenticated account upcoming event must be returned',
    )
    assert.equal(typeof body.stats?.totalBalance, 'number')
    assert.equal(typeof body.stats?.tasksDueToday, 'number')
    assert.equal(typeof body.stats?.lowStockCount, 'number')
  })
})