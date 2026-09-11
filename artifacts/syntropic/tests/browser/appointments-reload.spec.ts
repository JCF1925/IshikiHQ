import { test, expect, type Page } from '@playwright/test'

const appointmentId = 'browser-appointment-reload'
const practitionerId = 'browser-practitioner'
const practiceId = 'browser-practice'
const symptomId = 'browser-symptom'
const medicationId = 'browser-medication'
const prescriptionId = 'browser-prescription'
const scheduleId = 'browser-schedule'
const stockId = 'browser-stock'

const practitioner = {
  id: practitionerId,
  name: 'Dr. Ada Lovelace',
  role: 'General practitioner',
  referralRequired: false,
}

const practice = {
  id: practiceId,
  name: 'Analytical Health Practice',
}

const medication = {
  id: medicationId,
  name: 'Salbutamol',
  strength: '100 mcg',
  medType: 'prn',
  form: 'inhaler',
  isOtc: false,
}

function buildAppointment() {
  return {
    id: appointmentId,
    title: 'Respiratory review',
    appointmentType: 'gp',
    startTime: '2099-09-10T09:00:00.000Z',
    durationMinutes: 30,
    location: 'Room 4',
    status: 'scheduled',
    cost: 85,
    medicareItem: '23',
    medicareRebate: 42,
    outOfPocket: 43,
    notes: null,
    medicareRebateEligible: true,
    medicareRebateWarning: null,
    referralStatus: 'not_required',
    referralStatusMessage: '',
    referralRemaining: null,
    practitioner,
    organisation: practice,
  }
}

function buildCareData() {
  return {
    offerings: [],
    agenda: [],
    outcomes: [],
    medications: [medication],
    prescriptions: [{
      id: prescriptionId,
      medicationId,
      medication,
      repeats: 2,
      repeatsUsed: 1,
      expiryDate: '2099-12-31T00:00:00.000Z',
      prescriber: { id: practitionerId, organisationId: practiceId },
    }],
    schedules: [{
      id: scheduleId,
      medicationId,
      prescriptionId,
      frequency: 'as_needed',
      doseAmount: 2,
      times: [],
    }],
    stock: [{
      id: stockId,
      medicationId,
      medication,
      currentQuantity: 1,
      reorderThreshold: 2,
    }],
  }
}

async function stubAppointmentCare(page: Page) {
  let appointment = buildAppointment()
  const careData = buildCareData()
  let outcomeSequence = 0

  await page.route('**/api/appointments', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON()
      appointment = {
        ...appointment,
        ...body,
        practitioner,
        organisation: practice,
      }
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(appointment) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([appointment]) })
  })

  await page.route('**/api/appointments/*', async (route) => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON()
      appointment = { ...appointment, ...body }
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(appointment) })
  })

  await page.route('**/api/people', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([{ ...practitioner, type: 'practitioner' }]),
  }))
  await page.route('**/api/organisations', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([practice]),
  }))
  await page.route('**/api/referrals', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '[]',
  }))
  await page.route('**/api/symptoms', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([{ id: symptomId, name: 'Shortness of breath' }]),
  }))

  await page.route('**/api/appointment-care', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(careData),
  }))

  await page.route('**/api/appointment-care/agenda', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON()
      careData.agenda.push({
        id: `browser-agenda-${careData.agenda.length + 1}`,
        ...body,
        symptom: { id: symptomId, name: 'Shortness of breath' },
      })
    }
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(careData.agenda.at(-1) ?? {}) })
  })

  await page.route('**/api/appointment-care/agenda/*', async (route) => {
    if (route.request().method() === 'PATCH') {
      const id = route.request().url().split('/').pop()
      const item = careData.agenda.find((entry) => entry.id === id)
      Object.assign(item ?? {}, route.request().postDataJSON())
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(careData.agenda[0] ?? {}) })
  })

  await page.route('**/api/appointment-care/outcomes', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON()
      const outcome = {
        id: `browser-outcome-${++outcomeSequence}`,
        appointmentId,
        recordedAt: `2026-09-10T0${outcomeSequence}:00:00.000Z`,
        ...body,
      }
      careData.outcomes.unshift(outcome)
    }
    await route.fulfill({
      status: route.request().method() === 'POST' ? 201 : 200,
      contentType: 'application/json',
      body: JSON.stringify(careData.outcomes.at(0) ?? {}),
    })
  })

  return { appointment, careData }
}

test('appointment preparation and corrected outcomes survive a hard reload', async ({ page }) => {
  const { appointment, careData } = await stubAppointmentCare(page)

  await page.goto('/appointments')
  await expect(page.getByRole('heading', { name: 'Appointments', exact: true })).toBeVisible()
  const appointmentCard = page.getByText('Respiratory review', { exact: true }).locator('xpath=../../..')

  await appointmentCard.getByRole('button', { name: 'Agenda', exact: true }).click()
  const agendaDialog = page.getByRole('dialog', { name: 'Agenda for Respiratory review' })
  await expect(agendaDialog).toBeVisible()
  await agendaDialog.getByRole('button', { name: 'Add Agenda Item', exact: true }).click()
  const agendaInputs = agendaDialog.locator('input')
  await agendaInputs.nth(0).fill('Discuss breathing after exercise')
  await agendaInputs.nth(1).fill('The symptom is worse on long walks.')
  await agendaDialog.locator('select').nth(2).selectOption(symptomId)
  await agendaDialog.getByRole('button', { name: 'Save Item', exact: true }).click()

  const agendaItem = agendaDialog.getByText('Discuss breathing after exercise', { exact: true }).locator('xpath=../..')
  await expect(agendaItem).toBeVisible()
  await agendaItem.getByRole('button').click()
  await expect(agendaItem).toHaveClass(/opacity-60/)

  await expect(agendaDialog.getByText('Salbutamol 100 mcg', { exact: true })).toBeVisible()
  await expect(agendaDialog.getByText('As needed · dose 2', { exact: true })).toBeVisible()
  await agendaDialog.getByRole('tab', { name: 'Stock & Scripts', exact: true }).click()
  await expect(agendaDialog.getByText('1 left', { exact: true })).toBeVisible()
  await expect(agendaDialog.getByText('Active Prescriptions', { exact: true })).toBeVisible()
  await expect(agendaDialog.getByText('Repeats: 1/2', { exact: true })).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(agendaDialog).toBeHidden()

  // Move the stubbed visit into the past, as a completed appointment would be
  // after the preparation workflow in the real application.
  appointment.startTime = '2020-09-10T09:00:00.000Z'
  appointment.status = 'completed'
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Appointments', exact: true })).toBeVisible()
  await page.getByRole('tab', { name: /Past/ }).click()
  const pastCard = page.getByText('Respiratory review', { exact: true }).locator('xpath=../../..')
  await pastCard.getByRole('button', { name: 'Outcome', exact: true }).click()

  const outcomeDialog = page.getByRole('dialog', { name: 'Record Outcome' })
  await outcomeDialog.locator('textarea').fill('Initial visit outcome')
  await outcomeDialog.getByPlaceholder('Status (paid, pending)').fill('paid')
  await outcomeDialog.getByPlaceholder('Amount (AUD)').fill('85')
  await outcomeDialog.getByPlaceholder('Method (card, cash)').fill('card')
  await outcomeDialog.getByPlaceholder('e.g., Review in 6 months').fill('Review in three months')
  await outcomeDialog.getByPlaceholder('e.g., Book follow-up in 4 weeks').fill('Book spirometry')
  await outcomeDialog.getByPlaceholder('e.g., Book follow-up in 4 weeks').press('Enter')
  await outcomeDialog.getByRole('button', { name: 'Save Outcome', exact: true }).click()
  await expect(outcomeDialog).toBeHidden()

  await pastCard.getByRole('button', { name: 'Outcome', exact: true }).click()
  const correctionDialog = page.getByRole('dialog', { name: 'Correct Outcome' })
  await expect(correctionDialog).toContainText('Initial visit outcome')
  await correctionDialog.locator('textarea').fill('Corrected visit outcome')
  await correctionDialog.getByPlaceholder('Status (paid, pending)').fill('pending')
  await correctionDialog.getByPlaceholder('Amount (AUD)').fill('90')
  await correctionDialog.getByPlaceholder('Method (card, cash)').fill('transfer')
  await correctionDialog.getByPlaceholder('e.g., Review in 6 months').fill('Review in six months')
  await correctionDialog.getByRole('button', { name: 'Save Correction', exact: true }).click()
  await expect(correctionDialog).toBeHidden()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Appointments', exact: true })).toBeVisible()
  await page.getByRole('tab', { name: /Past/ }).click()
  const reloadedCard = page.getByText('Respiratory review', { exact: true }).locator('xpath=../../..')
  await expect(reloadedCard).toContainText('Outcome recorded')
  await reloadedCard.getByRole('button', { name: 'Outcome', exact: true }).click()

  const reloadedOutcomeDialog = page.getByRole('dialog', { name: 'Correct Outcome' })
  await expect(reloadedOutcomeDialog).toContainText('Outcome history')
  await expect(reloadedOutcomeDialog).toContainText('Corrected visit outcome')
  await expect(reloadedOutcomeDialog).toContainText('Initial visit outcome')
  await expect(reloadedOutcomeDialog).toContainText('Superseded record')
  await expect(reloadedOutcomeDialog).toContainText('pending · $90 · transfer')
  await expect(reloadedOutcomeDialog).toContainText('Review in six months')

  expect(careData.agenda[0]).toMatchObject({
    title: 'Discuss breathing after exercise',
    symptomId,
    status: 'discussed',
  })
  expect(careData.outcomes).toHaveLength(2)
  expect(careData.outcomes[0]).toMatchObject({
    outcome: 'Corrected visit outcome',
    supersedesId: 'browser-outcome-1',
  })
})