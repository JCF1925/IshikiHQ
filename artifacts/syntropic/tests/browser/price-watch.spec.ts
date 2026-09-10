import { test, expect, type Page } from '@playwright/test'

type Observation = {
  id: string
  price: number
  packQuantity: number
  packUnit: string
  shippingCost: number
  notes: string | null
}

type PriceWatch = {
  id: string
  productName: string
  packQuantity: number
  packUnit: string
  preferredRetailers: string[]
  targetPrice: number | null
  status: string
  observations: Observation[]
}

test.use({ viewport: { width: 390, height: 844 } })

async function getWatches(page: Page): Promise<PriceWatch[]> {
  const response = await page.request.get('/api/price-watches')
  expect(response.ok()).toBeTruthy()
  return response.json()
}

function watchCard(page: Page, productName: string) {
  return page.getByRole('heading', { name: productName, exact: true }).locator('xpath=../../..')
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }))

  expect(
    dimensions.body,
    `body scroll width ${dimensions.body} exceeds viewport ${dimensions.viewport}`,
  ).toBeLessThanOrEqual(dimensions.viewport)
  expect(
    dimensions.document,
    `document scroll width ${dimensions.document} exceeds viewport ${dimensions.viewport}`,
  ).toBeLessThanOrEqual(dimensions.viewport)
}

test('price watches save, edit, pause, and remain usable after reload on a narrow screen', async ({ page }) => {
  const suffix = Date.now()
  const productName = `E2E price watch ${suffix}`
  const sourceUrl = 'https://example.com/australian-price-watch'
  let watchId: string | undefined
  let observationId: string | undefined

  try {
    await page.goto('/price-watch')
    await expect(page.getByRole('heading', { name: 'Price watch', exact: true })).toBeVisible()
    await expect(page.getByLabel('Product name *')).toBeVisible()
    await expect(page.getByLabel('Pack quantity *')).toBeVisible()
    await expect(page.getByLabel('Unit *')).toBeVisible()
    await expect(page.getByLabel('Target price (AUD)')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create watch', exact: true })).toBeVisible()

    const productField = page.getByLabel('Product name *')
    await productField.focus()
    await expect(productField).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByLabel('Pack quantity *')).toBeFocused()

    await productField.fill(productName)
    await page.getByLabel('Pack quantity *').fill('500')
    await page.getByLabel('Unit *').selectOption('g')
    await page.getByLabel('Target price (AUD)').fill('6')
    await page.getByLabel('Preferred retailers').fill('Coles, Woolworths')
    await page.getByLabel('Check cadence').fill('weekly')
    await page.getByRole('button', { name: 'Create watch', exact: true }).click()

    const createdCard = watchCard(page, productName)
    await expect(createdCard).toBeVisible()
    await expect(createdCard).toContainText('Coles, Woolworths')
    await expect(createdCard.getByText('active', { exact: true })).toBeVisible()

    let watches = await getWatches(page)
    const createdWatch = watches.find((watch) => watch.productName === productName)
    expect(createdWatch).toBeDefined()
    watchId = createdWatch?.id
    expect(createdWatch).toMatchObject({
      productName,
      packQuantity: 500,
      packUnit: 'g',
      preferredRetailers: ['Coles', 'Woolworths'],
      targetPrice: 6,
      status: 'active',
    })

    await createdCard.getByRole('button', { name: 'Edit', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Edit watch', exact: true })).toBeVisible()
    await page.getByLabel('Preferred retailers').fill('Coles, Woolworths, Chemist Warehouse')
    await page.getByLabel('Target price (AUD)').fill('5')
    await page.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Edit watch', exact: true })).toHaveCount(0)
    await expect(createdCard).toContainText('Coles, Woolworths, Chemist Warehouse')

    watches = await getWatches(page)
    expect(watches.find((watch) => watch.id === watchId)).toMatchObject({
      targetPrice: 5,
      preferredRetailers: ['Coles', 'Woolworths', 'Chemist Warehouse'],
    })

    await createdCard.getByRole('button', { name: 'Pause', exact: true }).click()
    await expect(createdCard.getByText('paused', { exact: true })).toBeVisible()
    await createdCard.getByRole('button', { name: 'Resume', exact: true }).click()
    await expect(createdCard.getByText('active', { exact: true })).toBeVisible()

    await createdCard.getByLabel('Price AUD *').fill('4')
    await createdCard.getByLabel('Pack quantity *').fill('500')
    await createdCard.getByLabel('Pack unit *').selectOption('g')
    await createdCard.getByLabel('Shipping AUD').fill('1')
    await createdCard.getByLabel('Observed date and time *').fill('2026-09-10T12:00')
    await createdCard.getByLabel('Source URL').fill(sourceUrl)
    await createdCard.getByLabel('Membership assumption').fill('Everyday Rewards price')
    await createdCard.getByLabel('Notes').fill('Initial sourced shelf price')
    await createdCard.getByRole('button', { name: 'Add observation', exact: true }).click()

    await expect(page.locator('main')).toContainText('$5.00 total')
    await expect(page.locator('main')).toContainText('Target met')
    await expect(page.locator('main')).toContainText('$5.00 ÷ 500 g = $1.00 per 100g')
    await expectNoHorizontalOverflow(page)

    watches = await getWatches(page)
    const savedObservation = watches.find((watch) => watch.id === watchId)?.observations[0]
    expect(savedObservation).toBeDefined()
    observationId = savedObservation?.id
    expect(savedObservation).toMatchObject({
      price: 4,
      packQuantity: 500,
      packUnit: 'g',
      shippingCost: 1,
      notes: 'Initial sourced shelf price',
    })

    await createdCard.getByRole('button', { name: 'Edit', exact: true }).nth(1).click()
    await expect(createdCard.getByRole('button', { name: 'Save observation', exact: true })).toBeVisible()
    await createdCard.getByLabel('Price AUD *').fill('3.5')
    await createdCard.getByLabel('Shipping AUD').fill('0.5')
    await createdCard.getByLabel('Notes').fill('Updated sourced shelf price')
    await createdCard.getByRole('button', { name: 'Save observation', exact: true }).click()

    await expect(page.locator('main')).toContainText('$4.00 total')
    await expect(page.locator('main')).toContainText('Target met')
    await expect(page.locator('main')).toContainText('$4.00 ÷ 500 g = $0.80 per 100g')

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Price watch', exact: true })).toBeVisible()
    const reloadedCard = watchCard(page, productName)
    await expect(reloadedCard).toContainText('Coles, Woolworths, Chemist Warehouse')
    await expect(reloadedCard.getByText('active', { exact: true })).toBeVisible()
    await expect(page.locator('main')).toContainText('$4.00 total')
    await expect(page.locator('main')).toContainText('Target met')
    await expect(page.locator('main')).toContainText('$4.00 ÷ 500 g = $0.80 per 100g')
    await expectNoHorizontalOverflow(page)

    watches = await getWatches(page)
    expect(watches.find((watch) => watch.id === watchId)?.observations[0]).toMatchObject({
      id: observationId,
      price: 3.5,
      shippingCost: 0.5,
      notes: 'Updated sourced shelf price',
    })

    page.once('dialog', (dialog) => dialog.accept())
    await reloadedCard.getByRole('button', { name: 'Delete observation', exact: true }).click()
    await expect(reloadedCard).toContainText('No observations yet. Add the first sourced price below.')

    watches = await getWatches(page)
    expect(watches.find((watch) => watch.id === watchId)?.observations).toEqual([])

    page.once('dialog', (dialog) => dialog.accept())
    await reloadedCard.getByRole('button', { name: `Delete ${productName} watch`, exact: true }).click()
    await expect(page.getByRole('heading', { name: productName, exact: true })).toHaveCount(0)
    await expect(page.getByText('No price watches yet. Add one above to start tracking.', { exact: true })).toBeVisible()

    watches = await getWatches(page)
    expect(watches.some((watch) => watch.id === watchId)).toBe(false)
  } finally {
    const remaining = await getWatches(page).catch(() => [])
    for (const watch of remaining.filter((item) => item.productName === productName)) {
      await page.request.delete(`/api/price-watches/${watch.id}`)
    }
  }
})