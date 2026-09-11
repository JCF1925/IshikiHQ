import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { prisma } from '../lib/db.ts'

const databaseTestsEnabled = process.env.APPOINTMENT_CARE_DATABASE_TESTS === '1'
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

describe('appointment-care database privacy acceptance', { skip: !databaseTestsEnabled }, () => {
  it('keeps offerings, agendas, appointments, and corrected outcomes private between accounts', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const ownerAId = `appointment-care-owner-a-${suffix}`
    const ownerBId = `appointment-care-owner-b-${suffix}`
    const privateA = `appointment-care-private-a-${suffix}`
    const privateB = `appointment-care-private-b-${suffix}`

    const ownerA = await prisma.user.create({
      data: { id: ownerAId, email: `${ownerAId}@example.test`, name: 'Appointment care owner A' },
    })
    const ownerB = await prisma.user.create({
      data: { id: ownerBId, email: `${ownerBId}@example.test`, name: 'Appointment care owner B' },
    })

    try {
      const practiceA = await prisma.organisation.create({
        data: { userId: ownerA.id, name: `Practice A ${suffix}`, type: 'medical_practice' },
      })
      const practitionerA = await prisma.person.create({
        data: {
          userId: ownerA.id,
          name: `Practitioner A ${suffix}`,
          type: 'practitioner',
          role: 'GP',
          organisationId: practiceA.id,
        },
      })
      const symptomA = await prisma.symptom.create({
        data: { userId: ownerA.id, name: `Symptom A ${suffix}` },
      })
      const practiceB = await prisma.organisation.create({
        data: { userId: ownerB.id, name: `Practice B ${suffix}`, type: 'medical_practice' },
      })
      const practitionerB = await prisma.person.create({
        data: {
          userId: ownerB.id,
          name: `Practitioner B ${suffix}`,
          type: 'practitioner',
          role: 'GP',
          organisationId: practiceB.id,
        },
      })
      const symptomB = await prisma.symptom.create({
        data: { userId: ownerB.id, name: `Symptom B ${suffix}` },
      })

      const [
        { GET: getCare, },
        { GET: listOfferings, POST: createOffering },
        { PATCH: updateOffering },
        { GET: listAgenda, POST: createAgenda },
        { PATCH: updateAgenda },
        { GET: listOutcomes, POST: createOutcome },
        { GET: listAppointments, POST: createAppointment },
        { PATCH: updateAppointment, DELETE: deleteAppointment },
      ] = await Promise.all([
        import('../app/api/appointment-care/route.ts'),
        import('../app/api/appointment-care/offerings/route.ts'),
        import('../app/api/appointment-care/offerings/[id]/route.ts'),
        import('../app/api/appointment-care/agenda/route.ts'),
        import('../app/api/appointment-care/agenda/[id]/route.ts'),
        import('../app/api/appointment-care/outcomes/route.ts'),
        import('../app/api/appointments/route.ts'),
        import('../app/api/appointments/[id]/route.ts'),
      ])

      routeSession.userId = ownerA.id
      const offeringAResponse = await createOffering(jsonRequest(
        'http://localhost/api/appointment-care/offerings',
        'POST',
        {
          name: `Offering A ${suffix}`,
          description: privateA,
          appointmentType: 'consultation',
          practiceId: practiceA.id,
          practitionerId: practitionerA.id,
          durationMinutes: 30,
          defaultCost: 100,
        },
      ))
      assert.equal(offeringAResponse.status, 201)
      const offeringA = await offeringAResponse.json() as { id: string }

      const appointmentAResponse = await createAppointment(jsonRequest(
        'http://localhost/api/appointments',
        'POST',
        {
          title: `Appointment A ${suffix}`,
          practitionerId: practitionerA.id,
          organisationId: practiceA.id,
          offeringId: offeringA.id,
          appointmentType: 'consultation',
          startTime: '2026-09-10T10:00:00.000Z',
          notes: privateA,
        },
      ))
      assert.equal(appointmentAResponse.status, 201)
      const appointmentA = await appointmentAResponse.json() as { id: string }

      const agendaAResponse = await createAgenda(jsonRequest(
        'http://localhost/api/appointment-care/agenda',
        'POST',
        {
          title: `Agenda A ${suffix}`,
          details: privateA,
          practitionerId: practitionerA.id,
          practiceId: practiceA.id,
          symptomId: symptomA.id,
          appointmentId: appointmentA.id,
        },
      ))
      assert.equal(agendaAResponse.status, 201)
      const agendaA = await agendaAResponse.json() as { id: string }

      const outcomeAResponse = await createOutcome(jsonRequest(
        'http://localhost/api/appointment-care/outcomes',
        'POST',
        {
          appointmentId: appointmentA.id,
          outcome: `Outcome A ${suffix}`,
          followUp: privateA,
          discussedItems: [`Discussed A ${suffix}`],
          payment: { status: 'paid', reference: privateA },
          medicationChanges: [{ name: `Medication A ${suffix}`, action: 'continue' }],
          futureTasks: [`Task A ${suffix}`],
        },
      ))
      assert.equal(outcomeAResponse.status, 201)
      const outcomeA = await outcomeAResponse.json() as { id: string }

      const correctionAResponse = await createOutcome(jsonRequest(
        'http://localhost/api/appointment-care/outcomes',
        'POST',
        {
          appointmentId: appointmentA.id,
          outcome: `Corrected outcome A ${suffix}`,
          supersedesId: outcomeA.id,
          discussedItems: [`Corrected discussion A ${suffix}`],
          payment: { status: 'refunded', reference: privateA },
          futureTasks: [`Corrected task A ${suffix}`],
        },
      ))
      assert.equal(correctionAResponse.status, 201)
      const correctionA = await correctionAResponse.json() as {
        id: string
        userId: string
        appointmentId: string
        supersedesId: string
      }
      assert.equal(correctionA.userId, ownerA.id)
      assert.equal(correctionA.appointmentId, appointmentA.id)
      assert.equal(correctionA.supersedesId, outcomeA.id)

      routeSession.userId = ownerB.id
      const offeringBResponse = await createOffering(jsonRequest(
        'http://localhost/api/appointment-care/offerings',
        'POST',
        {
          name: `Offering B ${suffix}`,
          description: privateB,
          practiceId: practiceB.id,
          practitionerId: practitionerB.id,
        },
      ))
      assert.equal(offeringBResponse.status, 201)
      const offeringB = await offeringBResponse.json() as { id: string }

      const appointmentBResponse = await createAppointment(jsonRequest(
        'http://localhost/api/appointments',
        'POST',
        {
          title: `Appointment B ${suffix}`,
          practitionerId: practitionerB.id,
          organisationId: practiceB.id,
          offeringId: offeringB.id,
          appointmentType: 'consultation',
          startTime: '2026-09-10T11:00:00.000Z',
          notes: privateB,
        },
      ))
      assert.equal(appointmentBResponse.status, 201)
      const appointmentB = await appointmentBResponse.json() as { id: string }

      const agendaBResponse = await createAgenda(jsonRequest(
        'http://localhost/api/appointment-care/agenda',
        'POST',
        {
          title: `Agenda B ${suffix}`,
          details: privateB,
          practitionerId: practitionerB.id,
          practiceId: practiceB.id,
          symptomId: symptomB.id,
          appointmentId: appointmentB.id,
        },
      ))
      assert.equal(agendaBResponse.status, 201)
      await agendaBResponse.json()

      const outcomeBResponse = await createOutcome(jsonRequest(
        'http://localhost/api/appointment-care/outcomes',
        'POST',
        {
          appointmentId: appointmentB.id,
          outcome: `Outcome B ${suffix}`,
          discussedItems: [`Discussed B ${suffix}`],
        },
      ))
      assert.equal(outcomeBResponse.status, 201)
      await outcomeBResponse.json()

      const assertPrivateList = (value: unknown, ownMarker: string, otherMarker: string) => {
        const serialized = JSON.stringify(value)
        assert.match(serialized, new RegExp(ownMarker))
        assert.doesNotMatch(serialized, new RegExp(otherMarker))
      }

      const ownerBOfferingList = await listOfferings()
      assert.equal(ownerBOfferingList.status, 200)
      assertPrivateList(await ownerBOfferingList.json(), privateB, privateA)

      const ownerBAgendaList = await listAgenda()
      assert.equal(ownerBAgendaList.status, 200)
      assertPrivateList(await ownerBAgendaList.json(), privateB, privateA)

      const ownerBOutcomeList = await listOutcomes()
      assert.equal(ownerBOutcomeList.status, 200)
      assertPrivateList(await ownerBOutcomeList.json(), 'Outcome B', 'Outcome A')

      const ownerBAppointmentList = await listAppointments()
      assert.equal(ownerBAppointmentList.status, 200)
      assertPrivateList(await ownerBAppointmentList.json(), privateB, privateA)

      const ownerBCare = await getCare()
      assert.equal(ownerBCare.status, 200)
      assertPrivateList(await ownerBCare.json(), privateB, privateA)

      assert.equal((await createOffering(jsonRequest(
        'http://localhost/api/appointment-care/offerings',
        'POST',
        { name: 'Cross-account offering', practiceId: practiceA.id, practitionerId: practitionerA.id },
      ))).status, 400)
      assert.equal((await updateOffering(
        jsonRequest('http://localhost/api/appointment-care/offerings/a', 'PATCH', { name: 'Should not change' }),
        { params: Promise.resolve({ id: offeringA.id }) },
      )).status, 404)

      assert.equal((await createAgenda(jsonRequest(
        'http://localhost/api/appointment-care/agenda',
        'POST',
        {
          title: 'Cross-account agenda',
          practitionerId: practitionerA.id,
          practiceId: practiceA.id,
          symptomId: symptomA.id,
          appointmentId: appointmentA.id,
        },
      ))).status, 400)
      assert.equal((await updateAgenda(
        jsonRequest('http://localhost/api/appointment-care/agenda/a', 'PATCH', { details: 'Should not change' }),
        { params: Promise.resolve({ id: agendaA.id }) },
      )).status, 404)

      assert.equal((await createOutcome(jsonRequest(
        'http://localhost/api/appointment-care/outcomes',
        'POST',
        { appointmentId: appointmentA.id, outcome: 'Cross-account outcome' },
      ))).status, 400)
      assert.equal((await createOutcome(jsonRequest(
        'http://localhost/api/appointment-care/outcomes',
        'POST',
        { appointmentId: appointmentA.id, outcome: 'Cross-account correction', supersedesId: outcomeA.id },
      ))).status, 400)
      assert.equal((await createOutcome(jsonRequest(
        'http://localhost/api/appointment-care/outcomes',
        'POST',
        { appointmentId: appointmentB.id, outcome: 'Cross-account supersede', supersedesId: outcomeA.id },
      ))).status, 400)

      assert.equal((await createAppointment(jsonRequest(
        'http://localhost/api/appointments',
        'POST',
        {
          title: 'Cross-account appointment',
          practitionerId: practitionerA.id,
          organisationId: practiceA.id,
          offeringId: offeringA.id,
          startTime: '2026-09-10T12:00:00.000Z',
        },
      ))).status, 400)
      assert.equal((await updateAppointment(
        jsonRequest('http://localhost/api/appointments/a', 'PATCH', { notes: 'Should not change' }),
        { params: Promise.resolve({ id: appointmentA.id }) },
      )).status, 404)
      assert.equal((await deleteAppointment(
        new Request(`http://localhost/api/appointments/${appointmentA.id}`, { method: 'DELETE' }),
        { params: Promise.resolve({ id: appointmentA.id }) },
      )).status, 404)

      const persistedCorrection = await prisma.appointmentOutcome.findUnique({
        where: { id: correctionA.id },
      })
      assert.deepEqual({
        userId: persistedCorrection?.userId,
        appointmentId: persistedCorrection?.appointmentId,
        supersedesId: persistedCorrection?.supersedesId,
        payment: persistedCorrection?.payment,
      }, {
        userId: ownerA.id,
        appointmentId: appointmentA.id,
        supersedesId: outcomeA.id,
        payment: { status: 'refunded', reference: privateA },
      })
      assert.equal(await prisma.appointmentOutcome.count({ where: { userId: ownerA.id } }), 2)
      assert.equal(await prisma.appointmentOutcome.count({ where: { userId: ownerB.id } }), 1)
      assert.equal(await prisma.appointment.count({ where: { id: appointmentA.id, userId: ownerA.id } }), 1)
      assert.equal(await prisma.appointment.count({ where: { id: appointmentB.id, userId: ownerB.id } }), 1)
    } finally {
      routeSession.userId = ''
      await prisma.user.deleteMany({ where: { id: { in: [ownerA.id, ownerB.id] } } })
    }
  })
})