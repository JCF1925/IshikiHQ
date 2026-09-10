import { test, expect, type Page } from '@playwright/test'

const viewports = [
  { name: 'desktop', width: 1440, height: 900, enlargedText: false },
  { name: 'mobile', width: 390, height: 844, enlargedText: false },
  { name: 'mobile with enlarged text', width: 390, height: 844, enlargedText: true },
] as const

async function enlargeText(page: Page) {
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%'
  })
  await expect(page.locator('html')).toHaveCSS('font-size', '32px')
}

async function expectShortcutLayout(page: Page) {
  const links = page.locator('#main-content').getByRole('link', {
    name: /^(?:Bills|BNPL) workspace$/,
  })
  await expect(links).toHaveCount(2)

  const boxes = await links.evaluateAll((elements) =>
    elements.map((element) => {
      const { bottom, left, right, top } = element.getBoundingClientRect()
      return { bottom, left, right, top }
    }),
  )
  const viewport = await page.evaluate(() => ({
    height: window.innerHeight,
    width: window.innerWidth,
  }))

  for (const box of boxes) {
    expect(box.left).toBeGreaterThanOrEqual(0)
    expect(box.right).toBeLessThanOrEqual(viewport.width)
    expect(box.top).toBeGreaterThanOrEqual(0)
    expect(box.bottom).toBeLessThanOrEqual(viewport.height)
  }

  const [first, second] = boxes
  const doNotOverlap =
    first.right <= second.left ||
    second.right <= first.left ||
    first.bottom <= second.top ||
    second.bottom <= first.top
  expect(doNotOverlap).toBe(true)
}

async function expectWorkspaceLink(
  page: Page,
  name: 'Bills workspace' | 'BNPL workspace',
  path: '/bills' | '/bnpl',
) {
  const link = page.locator('#main-content').getByRole('link', { name, exact: true })

  await expect(link).toBeVisible()
  await expect(link).toBeInViewport()
  await expect(link).toHaveAttribute('href', path)
  await link.click()
  await expect(page).toHaveURL(new RegExp(`${path.replace('/', '\\/')}(?:\\?.*)?$`))
}

for (const viewport of viewports) {
  test(`Money workspace links remain usable at the ${viewport.name} viewport`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.goto('/commitments')

    if (viewport.enlargedText) {
      await enlargeText(page)
    }

    await expect(
      page.getByRole('heading', { name: 'Commitments overview', exact: true }),
    ).toBeVisible()
    await expectShortcutLayout(page)

    await expectWorkspaceLink(page, 'Bills workspace', '/bills')

    await page.goto('/commitments')
    if (viewport.enlargedText) {
      await enlargeText(page)
    }
    await expectWorkspaceLink(page, 'BNPL workspace', '/bnpl')
  })
}