import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { readFileSync } from 'node:fs'
import { prisma } from '../lib/db.ts'
import { applyIncreases, currentSuperRate } from '../lib/tax'
import { buildCompensationTimeline } from '../lib/work-compensation'
import {
  compensationSchema,
  employmentRoleSchema,
  projectCreateSchema,
  salaryIncreaseCreateSchema,
} from '../lib/validation'

/* Database acceptance coverage. Enable only against an isolated disposable DB:
 * PAY_REVIEW_DATABASE_TESTS=1 pnpm exec tsx --test --experimental-test-module-mocks tests/work.test.ts */
const databaseTestsEnabled = process.env.PAY_REVIEW_DATABASE_TESTS === '1'
const routeSession = { userId: '', expired: false }
let failureMode: 'review' | 'delete' | null = null
const databaseFailure = () => new Error('pay review acceptance database failure')

mock.module('@/auth', {
  namedExports: {
    auth: async () => routeSession.userId && !routeSession.expired
      ? { user: { id: routeSession.userId } }
      : null,
  },
})
mock.module('@/lib/db', {
  namedExports: {
    prisma: new Proxy(prisma, {
      get(target, property, receiver) {
        if (property === '$transaction' && failureMode === 'review') {
          return async () => { throw databaseFailure() }
        }
        if (property === 'salaryIncrease' && failureMode === 'delete') {
          return { findFirst: async () => { throw databaseFailure() } }
        }
        return Reflect.get(target, property, receiver)
      },
    }),
  },
})

const json = (body: unknown, method = 'PATCH') => new Request('http://pay-review.test', {
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

const responseBody = async (response: Response) => response.json() as Promise<{
  error?: { code?: string; message?: string; details?: { diagnosticId?: string } }
  idempotent?: boolean
  [key: string]: unknown
}>

const assertDiagnosticId = (body: Awaited<ReturnType<typeof responseBody>>) => {
  assert.match(
    body.error?.details?.diagnosticId ?? '',
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  )
}

describe('work beta acceptance', () => {
  it('keeps pending and rejected pay proposals out of forecasts', () => {
    const changes = [
      { effectiveDate: '2026-01-01', changeType: 'percent', value: 10, status: 'pending' },
      { effectiveDate: '2026-02-01', changeType: 'percent', value: 20, status: 'rejected' },
    ]
    assert.equal(applyIncreases(100_000, changes, new Date('2026-12-01')), 100_000)
    assert.equal(currentSuperRate(12, [{ effectiveDate: '2026-01-01', changeType: 'sg_rate', value: 15, status: 'rejected' }], new Date('2026-12-01')), 12)
  })

  it('applies only approved effective-dated pay proposals', () => {
    const changes = [
      { effectiveDate: '2026-01-01', changeType: 'percent', value: 10, status: 'approved' },
      { effectiveDate: '2027-01-01', changeType: 'percent', value: 50, status: 'approved' },
    ]
    assert.equal(applyIncreases(100_000, changes, new Date('2026-06-01')), 110_000)
  })

  it('rebuilds every later compensation point when an earlier proposal is approved late', () => {
    // This list represents a late approval of the January change after the
    // April change was already approved. Rebuilding, instead of appending,
    // makes April cumulative and matches forecast math.
    const timeline = buildCompensationTimeline({
      baseAmount: 100_000,
      baseSuperRate: 12,
      sourceStartDate: new Date('2026-01-01'),
      roleStartDate: new Date('2026-01-01'),
      changes: [
        { id: 'april', effectiveDate: '2026-04-01', createdAt: '2026-04-02', changeType: 'percent', value: 10, status: 'approved' },
        { id: 'january', effectiveDate: '2026-01-01', createdAt: '2026-05-02', changeType: 'percent', value: 5, status: 'approved' },
        { id: 'sg', effectiveDate: '2026-04-01', createdAt: '2026-04-03', changeType: 'sg_rate', value: 13, status: 'approved' },
      ],
    })
    assert.deepEqual(timeline.map((point) => [point.effectiveFrom.toISOString().slice(0, 10), point.amount, point.superRate]), [
      ['2026-01-01', 105_000, 12],
      ['2026-04-01', 115_500, 13],
    ])
    assert.equal(applyIncreases(100_000, [
      { effectiveDate: '2026-01-01', changeType: 'percent', value: 5, status: 'approved' },
      { effectiveDate: '2026-04-01', changeType: 'percent', value: 10, status: 'approved' },
    ], new Date('2026-05-01')), timeline.at(-1)?.amount)
  })

  it('keeps rejected concurrent-decision paths free of compensation side effects', () => {
    const source = readFileSync(new URL('../app/api/salary-increases/[id]/route.ts', import.meta.url), 'utf8')
    assert.match(source, /updateMany\(\{[\s\S]*?status: 'pending'/)
    assert.match(source, /if \(requestedStatus === 'approved'\)/)
    assert.match(source, /if \(!claim\.count\)[\s\S]*?return \{ won: false/)
    assert.match(source, /pg_advisory_xact_lock\(hashtextextended\(\$\{claimed\.incomeSourceId\}, 0\)\)/)
    assert.ok(source.indexOf('pg_advisory_xact_lock') < source.indexOf("increases: { where: { status: 'approved' }"), 'source lock precedes approved timeline read')
  })

  it('preserves reviewed proposals and only offers deletion for pending proposals', () => {
    const route = readFileSync(new URL('../app/api/salary-increases/[id]/route.ts', import.meta.url), 'utf8')
    const ui = readFileSync(new URL('../app/(app)/income/income-client.tsx', import.meta.url), 'utf8')
    assert.match(route, /existing\.status !== 'pending'[\s\S]*?apiError\('CONFLICT',[\s\S]*?409\)/)
    assert.match(route, /deleteMany\(\{ where: \{ id, userId, status: 'pending' \} \}\)/)
    assert.match(ui, /\{inc\.status === 'pending' && \(\s*<Button variant="ghost"/)
  })

  it('keeps pay review failures coded, safe, and actionable', () => {
    const route = readFileSync(new URL('../app/api/salary-increases/[id]/route.ts', import.meta.url), 'utf8')
    const ui = readFileSync(new URL('../app/(app)/income/income-client.tsx', import.meta.url), 'utf8')
    assert.match(route, /apiError\('UNAUTHORIZED', 'Authentication required', 401\)/)
    assert.match(route, /apiError\('NOT_FOUND', 'Pay change proposal not found', 404\)/)
    assert.match(route, /code: 'CONFLICT'/)
    assert.match(route, /function salaryIncreaseFailure\(action: 'review' \| 'delete'/)
    assert.match(route, /apiError\(\s*'INTERNAL_ERROR',[\s\S]*\{ diagnosticId \}/)
    assert.match(route, /return salaryIncreaseFailure\('review', error\)/)
    assert.match(route, /return salaryIncreaseFailure\('delete', error\)/)
    assert.match(ui, /class ApiRequestError extends Error/)
    assert.match(ui, /Diagnostic ID: \$\{error\.diagnosticId\}/)
    assert.match(ui, /Pay change could not be reviewed\. Try again\./)
    assert.match(ui, /Pay change approved, but the income list could not be refreshed/)
    assert.match(ui, /Pay change rejected, but the income list could not be refreshed/)
    assert.match(ui, /Increase removed, but the pay change list could not be refreshed/)
  })

  describe('pay review database acceptance', { skip: !databaseTestsEnabled }, () => {
    it('reviews, rejects, deletes, and recovers safely on a migrated schema', async () => {
      const suffix = `${process.pid}-${Date.now()}-${Math.random()}`
      const user = await prisma.user.create({ data: { email: `pay-review-${suffix}@example.test` } })
      routeSession.userId = user.id
      const organisation = await prisma.organisation.create({
        data: { userId: user.id, name: `Pay review employer ${suffix}`, type: 'employer' },
      })
      const income = await prisma.incomeSource.create({
        data: {
          userId: user.id,
          name: 'Pay review salary',
          amount: 100_000,
          frequency: 'annually',
          startDate: new Date('2026-01-01'),
          superRate: 12,
        },
      })
      const role = await prisma.employmentRole.create({
        data: {
          userId: user.id,
          organisationId: organisation.id,
          incomeSourceId: income.id,
          title: 'Acceptance engineer',
          startDate: new Date('2026-01-01'),
        },
      })
      const concurrentIncome = await prisma.incomeSource.create({
        data: {
          userId: user.id,
          name: 'Concurrent pay review salary',
          amount: 100_000,
          frequency: 'annually',
          startDate: new Date('2026-01-01'),
          superRate: 12,
        },
      })
      const concurrentRole = await prisma.employmentRole.create({
        data: {
          userId: user.id,
          organisationId: organisation.id,
          incomeSourceId: concurrentIncome.id,
          title: 'Concurrent acceptance engineer',
          startDate: new Date('2026-01-01'),
        },
      })
      const lateApprovalIncome = await prisma.incomeSource.create({
        data: {
          userId: user.id,
          name: 'Late approval salary',
          amount: 100_000,
          frequency: 'annually',
          startDate: new Date('2026-01-01'),
          superRate: 12,
        },
      })
      const lateApprovalRole = await prisma.employmentRole.create({
        data: {
          userId: user.id,
          organisationId: organisation.id,
          incomeSourceId: lateApprovalIncome.id,
          title: 'Late approval acceptance engineer',
          startDate: new Date('2026-01-01'),
        },
      })
      const laterPercent = await prisma.salaryIncrease.create({
        data: {
          userId: user.id,
          incomeSourceId: lateApprovalIncome.id,
          effectiveDate: new Date('2026-04-01'),
          changeType: 'percent',
          value: 10,
        },
      })
      const laterSuperRate = await prisma.salaryIncrease.create({
        data: {
          userId: user.id,
          incomeSourceId: lateApprovalIncome.id,
          effectiveDate: new Date('2026-08-01'),
          changeType: 'sg_rate',
          value: 13,
          newSuperRate: 13,
        },
      })
      const laterAmount = await prisma.salaryIncrease.create({
        data: {
          userId: user.id,
          incomeSourceId: lateApprovalIncome.id,
          effectiveDate: new Date('2026-06-01'),
          changeType: 'amount',
          value: 5_000,
        },
      })
      const earlierPercent = await prisma.salaryIncrease.create({
        data: {
          userId: user.id,
          incomeSourceId: lateApprovalIncome.id,
          effectiveDate: new Date('2026-02-01'),
          changeType: 'percent',
          value: 5,
        },
      })
      const concurrentPercent = await prisma.salaryIncrease.create({
        data: {
          userId: user.id,
          incomeSourceId: concurrentIncome.id,
          effectiveDate: new Date('2026-02-01'),
          changeType: 'percent',
          value: 10,
        },
      })
      const concurrentAmount = await prisma.salaryIncrease.create({
        data: {
          userId: user.id,
          incomeSourceId: concurrentIncome.id,
          effectiveDate: new Date('2026-03-01'),
          changeType: 'amount',
          value: 5_000,
        },
      })
      const approve = await prisma.salaryIncrease.create({
        data: {
          userId: user.id,
          incomeSourceId: income.id,
          effectiveDate: new Date('2026-01-01'),
          changeType: 'percent',
          value: 10,
          notes: 'Approve acceptance fixture',
        },
      })
      const reject = await prisma.salaryIncrease.create({
        data: {
          userId: user.id,
          incomeSourceId: income.id,
          effectiveDate: new Date('2026-06-01'),
          changeType: 'amount',
          value: 2_000,
          notes: 'Reject acceptance fixture',
        },
      })
      const pendingDelete = await prisma.salaryIncrease.create({
        data: {
          userId: user.id,
          incomeSourceId: income.id,
          effectiveDate: new Date('2026-07-01'),
          changeType: 'percent',
          value: 3,
        },
      })
      const concurrent = await prisma.salaryIncrease.create({
        data: {
          userId: user.id,
          incomeSourceId: income.id,
          effectiveDate: new Date('2026-08-01'),
          changeType: 'percent',
          value: 4,
        },
      })
      const reviewFailure = await prisma.salaryIncrease.create({
        data: {
          userId: user.id,
          incomeSourceId: income.id,
          effectiveDate: new Date('2026-09-01'),
          changeType: 'percent',
          value: 5,
        },
      })
      const deleteFailure = await prisma.salaryIncrease.create({
        data: {
          userId: user.id,
          incomeSourceId: income.id,
          effectiveDate: new Date('2026-10-01'),
          changeType: 'percent',
          value: 6,
        },
      })

      try {
        const { PATCH, DELETE } = await import('../app/api/salary-increases/[id]/route.ts')

        const approvedResponse = await PATCH(
          json({ action: 'approve', decisionNotes: 'Approved in acceptance' }),
          { params: Promise.resolve({ id: approve.id }) },
        )
        assert.equal(approvedResponse.status, 200)
        const approved = await prisma.salaryIncrease.findUniqueOrThrow({ where: { id: approve.id } })
        assert.equal(approved.status, 'approved')
        assert.equal(approved.decisionNotes, 'Approved in acceptance')
        assert.equal((await prisma.employmentCompensation.findUniqueOrThrow({
          where: { roleId_effectiveFrom: { roleId: role.id, effectiveFrom: new Date('2026-01-01') } },
        })).amount, 110_000)

        const concurrentApprovals = await Promise.all([
          PATCH(
            json({ action: 'approve' }),
            { params: Promise.resolve({ id: concurrentPercent.id }) },
          ),
          PATCH(
            json({ action: 'approve' }),
            { params: Promise.resolve({ id: concurrentAmount.id }) },
          ),
        ])
        assert.deepEqual(concurrentApprovals.map((response) => response.status), [200, 200])
        assert.deepEqual(
          (await prisma.salaryIncrease.findMany({
            where: { id: { in: [concurrentPercent.id, concurrentAmount.id] } },
            orderBy: { effectiveDate: 'asc' },
            select: { status: true },
          })).map(({ status }) => status),
          ['approved', 'approved'],
        )
        assert.deepEqual(
          (await prisma.employmentCompensation.findMany({
            where: { roleId: concurrentRole.id },
            orderBy: { effectiveFrom: 'asc' },
            select: { effectiveFrom: true, amount: true, superRate: true },
          })).map((point) => ({
            effectiveFrom: point.effectiveFrom.toISOString().slice(0, 10),
            amount: point.amount,
            superRate: point.superRate,
          })),
          [
            { effectiveFrom: '2026-01-01', amount: 100_000, superRate: 12 },
            { effectiveFrom: '2026-02-01', amount: 110_000, superRate: 12 },
            { effectiveFrom: '2026-03-01', amount: 115_000, superRate: 12 },
          ],
        )

        for (const proposal of [laterPercent, laterAmount, laterSuperRate]) {
          const response = await PATCH(
            json({ action: 'approve' }),
            { params: Promise.resolve({ id: proposal.id }) },
          )
          assert.equal(response.status, 200)
        }
        const storedLateApprovalTimeline = async () => (
          await prisma.employmentCompensation.findMany({
            where: { roleId: lateApprovalRole.id },
            orderBy: { effectiveFrom: 'asc' },
            select: { effectiveFrom: true, amount: true, superRate: true },
          })
        ).map((point) => ({
          effectiveFrom: point.effectiveFrom.toISOString().slice(0, 10),
          amount: point.amount,
          superRate: point.superRate,
        }))
        assert.deepEqual(await storedLateApprovalTimeline(), [
          { effectiveFrom: '2026-01-01', amount: 100_000, superRate: 12 },
          { effectiveFrom: '2026-04-01', amount: 110_000, superRate: 12 },
          { effectiveFrom: '2026-06-01', amount: 115_000, superRate: 12 },
          { effectiveFrom: '2026-08-01', amount: 115_000, superRate: 13 },
        ])
        const lateApprovalResponse = await PATCH(
          json({ action: 'approve' }),
          { params: Promise.resolve({ id: earlierPercent.id }) },
        )
        assert.equal(lateApprovalResponse.status, 200)
        assert.deepEqual(
          await storedLateApprovalTimeline(),
          [
            { effectiveFrom: '2026-01-01', amount: 100_000, superRate: 12 },
            { effectiveFrom: '2026-02-01', amount: 105_000, superRate: 12 },
            { effectiveFrom: '2026-04-01', amount: 115_500, superRate: 12 },
            { effectiveFrom: '2026-06-01', amount: 120_500, superRate: 12 },
            { effectiveFrom: '2026-08-01', amount: 120_500, superRate: 13 },
          ],
        )

        const rejectedResponse = await PATCH(
          json({ action: 'reject', decisionNotes: 'Rejected in acceptance' }),
          { params: Promise.resolve({ id: reject.id }) },
        )
        assert.equal(rejectedResponse.status, 200)
        const rejected = await prisma.salaryIncrease.findUniqueOrThrow({ where: { id: reject.id } })
        assert.equal(rejected.status, 'rejected')
        assert.equal(rejected.decisionNotes, 'Rejected in acceptance')

        const deletedResponse = await DELETE(
          new Request('http://pay-review.test', { method: 'DELETE' }),
          { params: Promise.resolve({ id: pendingDelete.id }) },
        )
        assert.equal(deletedResponse.status, 200)
        assert.deepEqual(await responseBody(deletedResponse), { ok: true })
        assert.equal(await prisma.salaryIncrease.findUnique({ where: { id: pendingDelete.id } }), null)

        routeSession.expired = true
        const expiredResponse = await PATCH(
          json({ action: 'approve' }),
          { params: Promise.resolve({ id: reviewFailure.id }) },
        )
        assert.equal(expiredResponse.status, 401)
        const expired = await responseBody(expiredResponse)
        assert.deepEqual(expired.error, { code: 'UNAUTHORIZED', message: 'Authentication required' })
        routeSession.expired = false

        const missingResponse = await PATCH(
          json({ action: 'approve' }),
          { params: Promise.resolve({ id: 'missing-pay-review-proposal' }) },
        )
        assert.equal(missingResponse.status, 404)
        const missing = await responseBody(missingResponse)
        assert.deepEqual(missing.error, { code: 'NOT_FOUND', message: 'Pay change proposal not found' })

        const missingDeleteResponse = await DELETE(
          new Request('http://pay-review.test', { method: 'DELETE' }),
          { params: Promise.resolve({ id: 'missing-pay-review-proposal' }) },
        )
        assert.equal(missingDeleteResponse.status, 404)
        assert.deepEqual(
          (await responseBody(missingDeleteResponse)).error,
          { code: 'NOT_FOUND', message: 'Pay change proposal not found' },
        )

        const [concurrentApprove, concurrentReject] = await Promise.all([
          PATCH(
            json({ action: 'approve' }),
            { params: Promise.resolve({ id: concurrent.id }) },
          ),
          PATCH(
            json({ action: 'reject' }),
            { params: Promise.resolve({ id: concurrent.id }) },
          ),
        ])
        assert.deepEqual(
          [concurrentApprove.status, concurrentReject.status].sort((a, b) => a - b),
          [200, 409],
        )
        const conflictResponse = concurrentApprove.status === 409 ? concurrentApprove : concurrentReject
        const conflict = await responseBody(conflictResponse)
        assert.deepEqual(conflict.error, {
          code: 'CONFLICT',
          message: 'Pay change was already reviewed. Refresh the list to see its current status.',
        })
        assert.equal((await prisma.salaryIncrease.findUniqueOrThrow({ where: { id: concurrent.id } })).status !== 'pending', true)

        failureMode = 'review'
        const reviewFailureResponse = await PATCH(
          json({ action: 'approve' }),
          { params: Promise.resolve({ id: reviewFailure.id }) },
        )
        assert.equal(reviewFailureResponse.status, 500)
        const reviewFailureBody = await responseBody(reviewFailureResponse)
        assert.deepEqual(reviewFailureBody.error?.code, 'INTERNAL_ERROR')
        assert.deepEqual(reviewFailureBody.error?.message, 'Pay change could not be reviewed. Try again.')
        assert.doesNotMatch(JSON.stringify(reviewFailureBody), /pay review acceptance database failure/)
        assertDiagnosticId(reviewFailureBody)
        assert.equal((await prisma.salaryIncrease.findUniqueOrThrow({ where: { id: reviewFailure.id } })).status, 'pending')

        failureMode = 'delete'
        const deleteFailureResponse = await DELETE(
          new Request('http://pay-review.test', { method: 'DELETE' }),
          { params: Promise.resolve({ id: deleteFailure.id }) },
        )
        assert.equal(deleteFailureResponse.status, 500)
        const deleteFailureBody = await responseBody(deleteFailureResponse)
        assert.deepEqual(deleteFailureBody.error?.code, 'INTERNAL_ERROR')
        assert.deepEqual(deleteFailureBody.error?.message, 'Pay change could not be deleted. Try again.')
        assert.doesNotMatch(JSON.stringify(deleteFailureBody), /pay review acceptance database failure/)
        assertDiagnosticId(deleteFailureBody)
        assert.equal(await prisma.salaryIncrease.findUnique({ where: { id: deleteFailure.id } }) !== null, true)
      } finally {
        failureMode = null
        routeSession.userId = ''
        routeSession.expired = false
        await prisma.user.delete({ where: { id: user.id } })
      }
    })
  })

  it('allows overlapping roles while validating each effective range', () => {
    const first = employmentRoleSchema.parse({
      organisationId: 'clj123456789012345678901',
      title: 'Engineer',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    })
    const second = employmentRoleSchema.parse({
      organisationId: 'clj123456789012345678902',
      title: 'Consultant',
      employmentType: 'contractor',
      startDate: '2026-06-01',
    })
    assert.equal(first.title, 'Engineer')
    assert.equal(second.employmentType, 'contractor')
    assert.equal(employmentRoleSchema.safeParse({ ...first, endDate: '2025-01-01' }).success, false)
  })

  it('requires reviewable pay proposal and compensation inputs', () => {
    assert.equal(salaryIncreaseCreateSchema.safeParse({
      incomeSourceId: 'clj123456789012345678901',
      effectiveDate: '2026-07-01',
      changeType: 'sg_rate',
      value: 13,
    }).success, false)
    assert.equal(compensationSchema.safeParse({
      effectiveFrom: '2026-07-01',
      amount: 75,
      frequency: 'hourly',
    }).success, false)
  })

  it('permits only explicit work-project cross-module links', () => {
    const parsed = projectCreateSchema.parse({
      name: 'Launch',
      organisationId: 'clj123456789012345678901',
      goalId: 'clj123456789012345678902',
      taskIds: ['clj123456789012345678903'],
      eventIds: ['clj123456789012345678904'],
    })
    assert.deepEqual(Object.keys(parsed).sort(), ['eventIds', 'goalId', 'name', 'organisationId', 'status', 'taskIds'])
    assert.equal(projectCreateSchema.safeParse({ name: 'Launch', incomeSourceId: 'clj123456789012345678905' }).success, false)
    const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8')
    const projectBlock = schema.match(/model Project \{[\s\S]*?\n\}/)?.[0] ?? ''
    assert.doesNotMatch(projectBlock, /IncomeSource|Document/)
  })
})