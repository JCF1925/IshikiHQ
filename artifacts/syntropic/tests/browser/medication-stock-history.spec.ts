import { expect, test, type Page } from '@playwright/test'

const medicationId = 'browser-stock-history-medication'
const stockLevelId = 'browser-stock-history-level'

const medication = {
  id: medicationId,
  name: 'Release check medication',
  genericName: 'Release check generic',
  form: 'tablet',
  strength: '10',
  unit: 'mg',
  parentId: null,
  medType: 'scheduled',
  isSchedule8: false,
  isOtc: true,
  isActive: true,
  children: [],
  stockLevels: [],
  prescriptions: [],
  dosageSchedules: [],
  conditions: [],
}

function stockLevel(overrides: Record<string, unknown> = {}) {
  return {
    id: stockLevelId,
    userId: 'browser-stock-history-user',
    medicationId,
    currentQuantity: 8,
    reorderThreshold: 5,
    monthlyLimit: null,
    lastDispensed: null,
    notes: null,
    hasMismatch: true,
    ledgerQuantity: 9,
    lastLedgerBalance: 9,
    mismatchQuantity: 1,
    transactionCount: 2,
    hasHistoricalInconsistency: false,
    historicalBalanceMismatchCount: 0,
    ...overrides,
  }
}

async function stubMedicationApis(page: Page, level: ReturnType<typeof stockLevel>) {
  await page.route('**/api/medications', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([{ ...medication, stockLevels: [level] }]),
  }))
  await page.route('**/api/people', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([]),
  }))
  await page.route('**/api/prescriptions**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([]),
  }))
  await page.route('**/api/dosage-schedules**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([]),
  }))
  await page.route('**/api/stock-transactions**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([]),
  }))
  await page.route('**/api/medication-logs**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([]),
  }))
  await page.route('**/api/stock-levels', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([level]),
  }))
}

async function openStockTab(page: Page, level: ReturnType<typeof stockLevel>) {
  await stubMedicationApis(page, level)
  await page.goto('/medications')
  await expect(page.getByRole('heading', { name: 'Medications', exact: true })).toBeVisible()
  await page.getByRole('heading', { name: medication.name, exact: true }).click()

  const dialog = page.getByRole('dialog', { name: 'Medication details' })
  await expect(dialog).toBeVisible()
  await dialog.locator('div.cursor-pointer').filter({ hasText: '10 mg' }).first().click()
  await dialog.getByRole('tab', { name: 'Stock', exact: true }).click()
  await expect(dialog.getByText('Current Stock', { exact: true })).toBeVisible()
  return dialog
}

test.describe('medication stock-history release checks', () => {
  test('shows the review warning and hides reconciliation for inconsistent history', async ({ page }) => {
    const dialog = await openStockTab(page, stockLevel({
      hasHistoricalInconsistency: true,
      historicalBalanceMismatchCount: 1,
    }))

    await expect(dialog.getByRole('alert')).toContainText(
      'Stock history needs review',
    )
    await expect(dialog.getByRole('alert')).toContainText(
      'Do not reconcile this stock level until the history has been reviewed.',
    )
    await expect(dialog.getByRole('button', { name: 'Review mismatch', exact: true })).toHaveCount(0)
  })

  test('keeps the normal review action for a consistent historical mismatch', async ({ page }) => {
    const dialog = await openStockTab(page, stockLevel())

    await expect(dialog.getByRole('status')).toContainText(
      'Historical ledger mismatch',
    )
    await expect(dialog.getByRole('button', { name: 'Review mismatch', exact: true })).toBeVisible()
  })
})