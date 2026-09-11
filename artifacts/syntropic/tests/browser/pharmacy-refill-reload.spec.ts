import { expect, test } from '@playwright/test'

const medicationId = 'browser-refill-reload-medication'
const pharmacyId = 'browser-refill-reload-pharmacy'
const orderId = 'browser-refill-reload-order'

const medication = {
  id: medicationId,
  name: 'Reload refill medication',
  genericName: 'Reload refill generic',
  form: 'tablet',
  strength: '10',
  unit: 'mg',
  parentId: null,
  medType: 'scheduled',
  isSchedule8: false,
  isOtc: false,
  isActive: true,
  children: [],
  stockLevels: [],
  prescriptions: [],
  dosageSchedules: [],
  conditions: [],
}

const order = {
  id: orderId,
  status: 'received',
  createdAt: '2026-09-10T00:00:00.000Z',
  pharmacy: { id: pharmacyId, name: 'Reload pharmacy' },
  lines: [{
    id: 'browser-refill-reload-line',
    medicationId,
    quantity: 5,
    status: 'received',
    receivedAt: '2026-09-10T01:00:00.000Z',
    medication,
  }],
  events: [{ fromStatus: 'placed', toStatus: 'received' }],
}

const forecast = {
  medicationId,
  medication: medication.name,
  stock: 17,
  reorderThreshold: 5,
  projectedStock: 17,
  availablePrescriptionFills: 1,
  availablePrescriptionSupply: 30,
  prescriptionId: 'browser-refill-reload-prescription',
  scriptSupplyWarning: false,
  refillDate: null,
  needsRefill: false,
  uncertainty: 'No unrecorded PRN use is inferred.',
  pharmacyId,
  pharmacy: 'Reload pharmacy',
}

async function stubMedicationApis(page: import('@playwright/test').Page, orderReads: { count: number }) {
  await page.route('**/api/medications', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([medication]),
  }))
  await page.route('**/api/people', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([]),
  }))
  await page.route('**/api/prescriptions**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([]),
  }))
  await page.route('**/api/dosage-schedules**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([]),
  }))
  await page.route('**/api/medication-orders', route => {
    expect(route.request().method()).toBe('GET')
    orderReads.count += 1
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        pharmacies: [order.pharmacy],
        forecast: [forecast],
        orders: [order],
      }),
    })
  })
}

async function openRefillPanel(page: import('@playwright/test').Page) {
  await page.getByRole('heading', { name: medication.name, exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Medication details' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Order history', { exact: true })).toBeVisible()
  return dialog
}

test('keeps a received refill order and updated balances visible after reload', async ({ page }) => {
  const orderReads = { count: 0 }
  await stubMedicationApis(page, orderReads)

  await page.goto('/medications')
  await expect(page.getByRole('heading', { name: 'Medications', exact: true })).toBeVisible()
  const firstDialog = await openRefillPanel(page)
  await expect(firstDialog.getByText('received', { exact: true })).toBeVisible()
  await expect(firstDialog).toContainText('Projected stock: 17')
  await expect(firstDialog).toContainText('Available fills: 1')
  await expect(firstDialog).toContainText('1 recorded event')

  const readsBeforeReload = orderReads.count
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Medications', exact: true })).toBeVisible()
  const reloadedDialog = await openRefillPanel(page)
  await expect.poll(() => orderReads.count).toBeGreaterThan(readsBeforeReload)
  await expect(reloadedDialog.getByText('received', { exact: true })).toBeVisible()
  await expect(reloadedDialog).toContainText('Projected stock: 17')
  await expect(reloadedDialog).toContainText('Available fills: 1')
  await expect(reloadedDialog).toContainText('1 recorded event')
})