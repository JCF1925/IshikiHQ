import { expect, test, type Locator, type Page } from '@playwright/test'

const medicationId = 'browser-stock-history-medication'
const stockLevelId = 'browser-stock-history-level'
const historicalTransactionId = 'browser-stock-history-transaction'

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
    historicalMismatches: [],
    ...overrides,
  }
}

function inconsistentStockLevel() {
  return stockLevel({
    hasHistoricalInconsistency: true,
    historicalBalanceMismatchCount: 1,
    historicalMismatches: [{
      id: historicalTransactionId,
      date: '2026-09-10T10:00:00.000Z',
      recordedBalanceAfter: 8,
      ledgerBalance: 9,
    }],
  })
}

async function stubMedicationApis(
  page: Page,
  level: ReturnType<typeof stockLevel>,
  onStockReview?: (body: Record<string, unknown>) => void,
) {
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
  await page.route('**/api/stock-levels', async (route) => {
    if (route.request().method() === 'POST') {
      onStockReview?.(route.request().postDataJSON())
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ kind: 'resolved', diagnostic: level, resolution: {} }),
      })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([level]),
    })
  })
  await page.route('**/api/medication-orders', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ pharmacies: [], forecast: [], orders: [] }),
  }))
}

async function openStockTab(
  page: Page,
  level: ReturnType<typeof stockLevel>,
  onStockReview?: (body: Record<string, unknown>) => void,
) {
  await stubMedicationApis(page, level, onStockReview)
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

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }))

  expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport)
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport)
}

async function expectWithinViewport(page: Page, locator: Locator) {
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual((await page.viewportSize())!.width)
}

test.describe('medication stock-history release checks', () => {
  test('shows the blocked review warning without overflow on a narrow screen', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 })
    const dialog = await openStockTab(page, inconsistentStockLevel())

    const warning = dialog.getByRole('alert')
    await expect(warning).toContainText(
      'Stock history needs review',
    )
    await expect(warning).toContainText(
      'Do not reconcile this stock level until the history has been reviewed.',
    )
    await expect(warning).toBeVisible()
    await expectWithinViewport(page, warning)
    await expect(dialog.getByText('Entries needing review', { exact: true })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Review entry', exact: true })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Review mismatch', exact: true })).toHaveCount(0)
    await expectNoHorizontalOverflow(page)
  })

  test('keeps the stock-history warning and hides reconciliation after a medication reload', async ({ page }) => {
    await openStockTab(page, inconsistentStockLevel())

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Medications', exact: true })).toBeVisible()
    await page.getByRole('heading', { name: medication.name, exact: true }).click()

    const dialog = page.getByRole('dialog', { name: 'Medication details' })
    await expect(dialog).toBeVisible()
    await dialog.locator('div.cursor-pointer').filter({ hasText: '10 mg' }).first().click()
    await dialog.getByRole('tab', { name: 'Stock', exact: true }).click()
    await expect(dialog.getByText('Current Stock', { exact: true })).toBeVisible()
    await expect(dialog.getByRole('alert')).toContainText('Stock history needs review')
    await expect(dialog.getByRole('button', { name: 'Review mismatch', exact: true })).toHaveCount(0)
  })

  test('keeps the normal review action usable without overflow on a narrow screen', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 })
    const dialog = await openStockTab(page, stockLevel())

    await expect(dialog.getByRole('status')).toContainText(
      'Historical ledger mismatch',
    )
    const reviewButton = dialog.getByRole('button', { name: 'Review mismatch', exact: true })
    await expect(reviewButton).toBeVisible()
    await expect(reviewButton).toBeEnabled()
    await expectWithinViewport(page, reviewButton)
    await reviewButton.click()
    await expect(page.getByRole('dialog', { name: 'Review stock mismatch' })).toBeVisible()
    await expectNoHorizontalOverflow(page)
  })

  test('records the selected historical entry and review reason without editing it', async ({ page }) => {
    let reviewRequest: Record<string, unknown> | undefined
    const mismatch = {
      id: 'cmismatchbrowser001',
      date: '2026-09-02T09:00:00.000Z',
      recordedBalanceAfter: 12,
      ledgerBalance: 9,
    }
    const medicationDialog = await openStockTab(page, stockLevel({
      currentQuantity: 9,
      ledgerQuantity: 9,
      mismatchQuantity: 0,
      hasMismatch: false,
      hasHistoricalInconsistency: true,
      historicalBalanceMismatchCount: 1,
      historicalMismatches: [mismatch],
    }), body => { reviewRequest = body })

    await medicationDialog.getByRole('button', { name: 'Review entry', exact: true }).click()
    const reviewDialog = page.getByRole('dialog', { name: 'Review historical entry' })
    await expect(reviewDialog).toContainText('Recorded balance')
    await expect(reviewDialog).toContainText('12')
    await expect(reviewDialog).toContainText('Ledger balance')
    await expect(reviewDialog).toContainText('9')
    await reviewDialog.getByLabel('Reason for review').fill('Checked against the dispensing record.')
    await reviewDialog.getByRole('button', { name: 'Save review', exact: true }).click()

    await expect.poll(() => reviewRequest).toEqual({
      action: 'resolve_mismatch',
      id: stockLevelId,
      mismatchId: mismatch.id,
      expectedRecordedBalance: 12,
      expectedLedgerBalance: 9,
      reason: 'Checked against the dispensing record.',
    })
    await expect(reviewDialog).toHaveCount(0)
  })
})