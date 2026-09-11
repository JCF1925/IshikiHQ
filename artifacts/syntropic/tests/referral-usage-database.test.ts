/* Database acceptance coverage. Enable only against an isolated disposable DB:
 * REFERRAL_DATABASE_TESTS=1 pnpm exec tsx --test --experimental-test-module-mocks tests/referral-usage-database.test.ts */
import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { prisma } from '../lib/db.ts'

const databaseTestsEnabled = process.env.REFERRAL_DATABASE_TESTS === '1'
const routeSession = { userId: '' }

mock.module('@/auth', {
  namedExports: {
    auth: async () => routeSession.userId
      ? { user: { id: routeSession.userId } }
      : null,
  },
})
mock.module('@/lib/db', { namedExports: { prisma } })

const jsonRequest = (url: string, method: string, body: unknown) => new Request(url, {
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

const appointmentPayload = (input: {
  title: string
  startTime: Date
  practitionerId: string
  referralId: string
  status?: string
}) => ({
  title: input.title,
  startTime: input.startTime.toISOString(),
  practitionerId: input.practitionerId,
  referralId: input.referralId,
  status: input.status ?? 'completed',
  appointmentType: 'specialist',
})

describe('referral usage database acceptance', { skip: !databaseTestsEnabled }, () => {
  it('keeps counted usage idempotent while cancellation, corrections, referral changes, and practitioner changes release capacity', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const user = await prisma.user.create({
      data: { email: `referral-usage-${suffix}@example.test`, name: 'Referral usage owner' },
    })
    const practitioner = await prisma.person.create({
      data: {
        userId: user.id,
        name: 'Original specialist',
        type: 'practitioner',
        referralRequired: true,
      },
    })
    const otherPractitioner = await prisma.person.create({
      data: {
        userId: user.id,
        name: 'Replacement specialist',
        type: 'practitioner',
        referralRequired: true,
      },
    })
    const referral = await prisma.referral.create({
      data: {
        userId: user.id,
        practitionerId: practitioner.id,
        issueDate: new Date('2026-01-01T00:00:00.000Z'),
        validityType: 'indefinite',
        appointmentLimit: 2,
        serviceLimitPeriod: 'calendar_year',
      },
    })
    const replacementReferral = await prisma.referral.create({
      data: {
        userId: user.id,
        practitionerId: practitioner.id,
        issueDate: new Date('2026-01-01T00:00:00.000Z'),
        validityType: 'indefinite',
        appointmentLimit: 2,
        serviceLimitPeriod: 'calendar_year',
      },
    })

    try {
      const [{ POST: createAppointment }, { PATCH: updateAppointment }] = await Promise.all([
        import('../app/api/appointments/route.ts'),
        import('../app/api/appointments/[id]/route.ts'),
      ])
      routeSession.userId = user.id

      const create = async (title: string, startTime: Date, referralId = referral.id) => {
        const response = await createAppointment(jsonRequest(
          'http://referral-usage.test/api/appointments',
          'POST',
          appointmentPayload({ title, startTime, practitionerId: practitioner.id, referralId }),
        ))
        assert.equal(response.status, 201, await response.clone().text())
        return response.json() as Promise<{ id: string; medicareRebateEligible: boolean }>
      }
      const patch = async (id: string, body: Record<string, unknown>) => {
        const response = await updateAppointment(
          jsonRequest(`http://referral-usage.test/api/appointments/${id}`, 'PATCH', body),
          { params: Promise.resolve({ id }) },
        )
        assert.equal(response.status, 200, await response.clone().text())
        return response.json() as Promise<Record<string, unknown>>
      }

      const first = await create('First specialist visit', new Date('2026-01-10T09:00:00.000Z'))
      assert.equal(first.medicareRebateEligible, true)

      // Replaying the same completed update must reuse one ledger row.
      await patch(first.id, { status: 'completed' })
      await patch(first.id, { status: 'completed' })
      assert.equal(await prisma.referralUsage.count({
        where: { appointmentId: first.id, referralId: referral.id, status: 'counted' },
      }), 1)

      const second = await create('Second specialist visit', new Date('2026-02-10T09:00:00.000Z'))
      assert.equal(await prisma.referralUsage.count({
        where: { referralId: referral.id, status: 'counted' },
      }), 2)

      // Cancellation releases capacity and leaves a reasoned, auditable row.
      await patch(second.id, { status: 'cancelled' })
      assert.equal(await prisma.referralUsage.count({
        where: { referralId: referral.id, status: 'counted' },
      }), 1)
      const cancelledUsage = await prisma.referralUsage.findUniqueOrThrow({
        where: { appointmentId_referralId: { appointmentId: second.id, referralId: referral.id } },
      })
      assert.equal(cancelledUsage.status, 'released')
      assert.equal(cancelledUsage.releaseReason, 'appointment_cancelled')
      assert.ok(cancelledUsage.releasedAt)

      // A status correction can count the original appointment again without
      // creating a second row or changing the appointment/referral identity.
      await patch(first.id, { status: 'scheduled' })
      assert.equal(await prisma.referralUsage.count({
        where: { referralId: referral.id, status: 'counted' },
      }), 0)
      await patch(first.id, { status: 'completed' })
      assert.equal(await prisma.referralUsage.count({
        where: { referralId: referral.id, status: 'counted' },
      }), 1)

      // Moving the appointment to another referral releases the old referral
      // and counts the new one exactly once.
      await patch(first.id, { referralId: replacementReferral.id })
      assert.equal(await prisma.referralUsage.count({
        where: { referralId: referral.id, status: 'counted' },
      }), 0)
      assert.equal(await prisma.referralUsage.count({
        where: { referralId: replacementReferral.id, status: 'counted' },
      }), 1)

      // A practitioner correction makes the replacement referral ineligible,
      // then restoring the original practitioner safely restores usage.
      const wrongPractitioner = await patch(first.id, { practitionerId: otherPractitioner.id })
      assert.equal(wrongPractitioner.medicareRebateEligible, false)
      assert.equal(await prisma.referralUsage.count({
        where: { referralId: replacementReferral.id, status: 'counted' },
      }), 0)
      await patch(first.id, { practitionerId: practitioner.id })
      assert.equal(await prisma.referralUsage.count({
        where: { referralId: replacementReferral.id, status: 'counted' },
      }), 1)

      const referralRows = await prisma.referral.findMany({
        where: { id: { in: [referral.id, replacementReferral.id] } },
        select: { id: true, appointmentsUsed: true },
      })
      assert.deepEqual(
        referralRows.sort((a, b) => a.id.localeCompare(b.id)).map(({ id, appointmentsUsed }) => ({
          id,
          appointmentsUsed,
        })),
        [
          { id: referral.id, appointmentsUsed: 0 },
          { id: replacementReferral.id, appointmentsUsed: 1 },
        ].sort((a, b) => a.id.localeCompare(b.id)),
      )

      const usageRows = await prisma.referralUsage.findMany({
        where: { userId: user.id },
        orderBy: [{ appointmentId: 'asc' }, { referralId: 'asc' }],
        select: { appointmentId: true, referralId: true, status: true, releaseReason: true },
      })
      assert.equal(usageRows.length, 3)
      assert.deepEqual(
        usageRows.filter((row) => row.status === 'released').map(({ appointmentId, referralId, releaseReason }) => ({
          appointmentId,
          referralId,
          releaseReason,
        })),
        [
          { appointmentId: first.id, referralId: referral.id, releaseReason: 'appointment_corrected' },
          { appointmentId: second.id, referralId: referral.id, releaseReason: 'appointment_cancelled' },
        ].sort((a, b) => a.appointmentId.localeCompare(b.appointmentId)),
      )
      assert.deepEqual(usageRows.filter((row) => row.status === 'counted'), [{
        appointmentId: first.id,
        referralId: replacementReferral.id,
        status: 'counted',
        releaseReason: null,
      }])
    } finally {
      routeSession.userId = ''
      await prisma.user.delete({ where: { id: user.id } })
    }
  })

  it('applies calendar-year and rolling-twelve-month limits only to counted usage in each window', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const user = await prisma.user.create({
      data: { email: `referral-window-${suffix}@example.test`, name: 'Referral window owner' },
    })
    const practitioner = await prisma.person.create({
      data: {
        userId: user.id,
        name: 'Window specialist',
        type: 'practitioner',
        referralRequired: true,
      },
    })
    const calendarReferral = await prisma.referral.create({
      data: {
        userId: user.id,
        practitionerId: practitioner.id,
        issueDate: new Date('2025-01-01T00:00:00.000Z'),
        validityType: 'indefinite',
        appointmentLimit: 2,
        serviceLimitPeriod: 'calendar_year',
      },
    })
    const rollingReferral = await prisma.referral.create({
      data: {
        userId: user.id,
        practitionerId: practitioner.id,
        issueDate: new Date('2024-01-01T00:00:00.000Z'),
        validityType: 'indefinite',
        appointmentLimit: 2,
        serviceLimitPeriod: 'rolling_twelve_months',
      },
    })

    try {
      const [{ POST: createAppointment }, { GET: listReferrals }] = await Promise.all([
        import('../app/api/appointments/route.ts'),
        import('../app/api/referrals/route.ts'),
      ])
      routeSession.userId = user.id
      const create = async (title: string, startTime: Date, referralId: string) => {
        const response = await createAppointment(jsonRequest(
          'http://referral-window.test/api/appointments',
          'POST',
          appointmentPayload({ title, startTime, practitionerId: practitioner.id, referralId }),
        ))
        assert.equal(response.status, 201, await response.clone().text())
      }
      const currentYear = new Date().getUTCFullYear()
      await create('Prior calendar-year service', new Date(`${currentYear - 1}-12-31T09:00:00.000Z`), calendarReferral.id)
      await create('Current calendar-year service one', new Date(`${currentYear}-01-01T09:00:00.000Z`), calendarReferral.id)
      await create('Current calendar-year service two', new Date(`${currentYear}-02-01T09:00:00.000Z`), calendarReferral.id)

      const now = Date.now()
      await create('Outside rolling window', new Date(now - 540 * 24 * 60 * 60 * 1000), rollingReferral.id)
      await create('Inside rolling window one', new Date(now - 30 * 24 * 60 * 60 * 1000), rollingReferral.id)
      await create('Inside rolling window two', new Date(now - 24 * 60 * 60 * 1000), rollingReferral.id)

      const response = await listReferrals()
      assert.equal(response.status, 200)
      const referrals = await response.json() as Array<{
        id: string
        appointmentsUsed: number
        remaining: number | null
        status: string
        renewalReminder: boolean
      }>
      const calendar = referrals.find((item) => item.id === calendarReferral.id)
      const rolling = referrals.find((item) => item.id === rollingReferral.id)
      assert.deepEqual(
        {
          appointmentsUsed: calendar?.appointmentsUsed,
          remaining: calendar?.remaining,
          status: calendar?.status,
          renewalReminder: calendar?.renewalReminder,
        },
        { appointmentsUsed: 2, remaining: 0, status: 'exhausted', renewalReminder: true },
      )
      assert.deepEqual(
        {
          appointmentsUsed: rolling?.appointmentsUsed,
          remaining: rolling?.remaining,
          status: rolling?.status,
          renewalReminder: rolling?.renewalReminder,
        },
        { appointmentsUsed: 2, remaining: 0, status: 'exhausted', renewalReminder: true },
      )
      assert.equal(await prisma.referralUsage.count({
        where: { referralId: calendarReferral.id, status: 'counted' },
      }), 3)
      assert.equal(await prisma.referralUsage.count({
        where: { referralId: rollingReferral.id, status: 'counted' },
      }), 3)
    } finally {
      routeSession.userId = ''
      await prisma.user.delete({ where: { id: user.id } })
    }
  })
})