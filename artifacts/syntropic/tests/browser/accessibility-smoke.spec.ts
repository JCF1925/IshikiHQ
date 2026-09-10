import { test, expect, type Locator, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const viewports = [320, 390] as const
const themes = ['dark', 'light'] as const
const radixDialogDescriptionWarning =
  'Warning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.'

function recordBrowserConsoleMessages(page: Page) {
  const messages: string[] = []
  page.on('console', (message) => {
    messages.push(message.text())
  })
  return messages
}

function expectNoRadixDialogDescriptionWarnings(messages: string[]) {
  const warnings = messages.filter((message) => message.includes(radixDialogDescriptionWarning))
  expect(warnings, warnings.join('\n')).toEqual([])
}

async function goToDashboard(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
  await expect(page.locator('#main-content [role="alert"]')).toHaveCount(0)
  await expect(page.getByText('Upcoming Events', { exact: true })).toBeVisible()
}

async function expectPrimaryNavigationOrder(navigation: Locator) {
  const links = navigation.getByRole('link')
  await expect(links.nth(0)).toHaveText('Dashboard')
  await expect(links.nth(0)).toHaveAttribute('href', '/')
  await expect(links.nth(1)).toHaveText('Tasks')
  await expect(links.nth(1)).toHaveAttribute('href', '/tasks')
  await expect(links.nth(2)).toHaveText('Events')
  await expect(links.nth(2)).toHaveAttribute('href', '/events')
}

async function setTheme(page: Page, theme: (typeof themes)[number]) {
  await page.evaluate((nextTheme) => {
    window.localStorage.setItem('theme', nextTheme)
    document.documentElement.classList.remove('dark', 'light')
    document.documentElement.classList.add(nextTheme)
  }, theme)
  await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme}\\b`))
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

async function expectNoSeriousAxeViolations(page: Page) {
  // Wait for Framer Motion's initial in-view transitions to settle so axe
  // measures the rendered colors rather than semi-transparent animation frames.
  await page.waitForTimeout(750)
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    // Sonner's third-party live-region implementation uses role=status on
    // direct <ol> children; axe-core reports this vendor markup as a list
    // violation even though the toast items are otherwise keyboard accessible.
    .exclude('[data-sonner-toaster]')
    .analyze()
  const seriousOrCritical = results.violations.filter((violation) =>
    violation.impact === 'serious' || violation.impact === 'critical',
  )
  expect(
    seriousOrCritical,
    JSON.stringify(seriousOrCritical, null, 2),
  ).toEqual([])
}

test.describe('release accessibility smoke', () => {
  test('sign-in labels and invalid-credential error are keyboard accessible', async ({ page }) => {
    await page.goto('/login')

    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Password')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()

    await page.getByLabel('Email').fill(`invalid-${Date.now()}@example.test`)
    await page.getByLabel('Password').fill('not-the-password')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()

    const error = page.locator('#login-error')
    await expect(error).toHaveText('Invalid email or password.')
    await expect(page.getByLabel('Email')).toHaveAttribute('aria-describedby', 'login-error')
    await expect(page.getByLabel('Password')).toHaveAttribute('aria-describedby', 'login-error')
  })

  test('dashboard exposes a recoverable error state', async ({ page }) => {
    const browserConsoleMessages = recordBrowserConsoleMessages(page)
    await goToDashboard(page)
    await page.route('**/api/dashboard', (route) => route.abort())
    await page.reload()

    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
    await expect(page.locator('#main-content [role="alert"]')).toContainText('could not be loaded')
    await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible()
    expectNoRadixDialogDescriptionWarnings(browserConsoleMessages)
  })

  test('desktop navigation preserves primary hierarchy and Money destinations', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await goToDashboard(page)

    const primaryNavigation = page.getByRole('complementary', { name: 'Primary navigation' })
    await expectPrimaryNavigationOrder(primaryNavigation.locator('nav'))

    const moneySections = page.locator('#nav-group-money > div')
    await expect(moneySections).toHaveCount(7)
    for (const [index, label] of [
      'Transactions',
      'Assets',
      'Liabilities',
      'Regular transactions',
      'Earnings',
      'Taxation',
      'Planning',
    ].entries()) {
      await expect(moneySections.nth(index).locator(':scope > div').first()).toContainText(label)
    }

    const assetLinks = moneySections.nth(1).getByRole('link')
    await expect(assetLinks).toHaveText(['Bank accounts', 'Owned assets'])
    await expect(assetLinks.nth(0)).toHaveAttribute('href', '/accounts')
    await expect(assetLinks.nth(1)).toHaveAttribute('href', '/assets')
  })

  test('saved Money and Health routes highlight their matching destinations', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })

    for (const destination of [
      { path: '/transactions', heading: 'Transactions', link: 'Transactions' },
      { path: '/medications', heading: 'Medications', link: 'Medications' },
    ]) {
      await page.goto(destination.path)
      await expect(page.getByRole('heading', { name: destination.heading, exact: true })).toBeVisible()
      await expect(
        page
          .getByRole('complementary', { name: 'Primary navigation' })
          .getByRole('link', { name: destination.link, exact: true }),
      ).toHaveAttribute('aria-current', 'page')
    }
  })

  test('mobile navigation returns focus on Escape and closes before Settings navigation', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await goToDashboard(page)

    const menuButton = page.getByRole('button', { name: 'Open navigation menu' })
    await menuButton.click()
    await expect(page.getByRole('button', { name: 'Close navigation menu' })).toBeFocused()

    await page.keyboard.press('Escape')
    await expect(menuButton).toBeFocused()
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false')

    await menuButton.click()
    await page.getByRole('link', { name: 'Settings', exact: true }).click()
    await expect(page).toHaveURL(/\/settings$/)
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Open navigation menu' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  test('mobile navigation keeps primary priorities and closes after drawer navigation', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await goToDashboard(page)

    const bottomNavigation = page.getByRole('navigation', { name: 'Mobile primary navigation' })
    await expectPrimaryNavigationOrder(bottomNavigation)

    const menuButton = page.getByRole('button', { name: 'Open navigation menu' })
    const drawerNavigation = page.getByRole('complementary', { name: 'Primary navigation' })
    await menuButton.click()
    await expect(drawerNavigation).toBeVisible()
    await expectPrimaryNavigationOrder(drawerNavigation.locator('nav'))

    await drawerNavigation.getByRole('link', { name: 'Tasks', exact: true }).click()
    await expect(page).toHaveURL(/\/tasks$/)
    await expect(drawerNavigation).toBeHidden()
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false')
    await expect(bottomNavigation.getByRole('link', { name: 'Tasks', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    )

    await menuButton.click()
    await drawerNavigation.getByRole('link', { name: 'Medications', exact: true }).click()
    await expect(page).toHaveURL(/\/medications$/)
    await expect(drawerNavigation).toBeHidden()
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false')
  })

  test('quick add returns focus and exposes validation errors', async ({ page }) => {
    const browserConsoleMessages = recordBrowserConsoleMessages(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await goToDashboard(page)

    const quickAdd = page.getByRole('button', { name: 'Open quick add menu' })
    await quickAdd.click()
    await expect(page.getByRole('button', { name: 'Log medication' })).toBeFocused()

    await page.getByRole('button', { name: 'Add task' }).click()
    const quickTaskDialog = page.getByRole('dialog', { name: 'Quick Task' })
    await expect(quickTaskDialog).toBeVisible()
    await expect(quickTaskDialog).toHaveAttribute('aria-describedby', /.+/)
    await page.getByRole('button', { name: 'Save Task', exact: true }).click()
    await expect(page.locator('#quick-add-error')).toHaveText('Title is required.')
    await expect(page.getByLabel('Title')).toHaveAttribute('aria-describedby', 'quick-add-error')

    await page.keyboard.press('Escape')
    await expect(quickAdd).toBeFocused()
    await expect(page.getByRole('dialog', { name: 'Quick Task' })).toBeHidden()

    for (const action of [
      { button: 'Add transaction', dialog: 'Quick Transaction' },
      { button: 'Log medication', dialog: 'Log Medication' },
    ]) {
      await quickAdd.click()
      await page.getByRole('button', { name: action.button, exact: true }).click()
      const dialog = page.getByRole('dialog', { name: action.dialog, exact: true })
      await expect(dialog).toBeVisible()
      await expect(dialog).toHaveAttribute('aria-describedby', /.+/)
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
      await expect(quickAdd).toBeFocused()
    }

    expectNoRadixDialogDescriptionWarnings(browserConsoleMessages)
  })

  test('Settings keeps account deletion safe and all controls labelled', async ({ page }) => {
    const browserConsoleMessages = recordBrowserConsoleMessages(page)
    await goToDashboard(page)
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
    await page.waitForTimeout(750)

    await expect(page.getByLabel('Timezone')).toBeVisible()
    await expect(page.getByLabel('Currency')).toBeVisible()
    await expect(page.getByLabel('Theme')).toBeVisible()
    await expect(page.getByLabel('Type DELETE MY ACCOUNT to confirm')).toBeVisible()
    await expect(page.getByRole('button', { name: /Permanently delete account/i })).toBeDisabled()

    await page.getByLabel('Type DELETE MY ACCOUNT to confirm').fill('DELETE MY ACCOUNT')
    await expect(page.getByRole('button', { name: /Permanently delete account/i })).toBeEnabled()
    expectNoRadixDialogDescriptionWarnings(browserConsoleMessages)
  })

  for (const theme of themes) {
    test(`authenticated dashboard has no serious or critical axe violations in ${theme} theme`, async ({
      page,
    }) => {
      await goToDashboard(page)
      await setTheme(page, theme)
      await expectNoSeriousAxeViolations(page)

      await page.goto('/settings')
      await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
      await expectNoSeriousAxeViolations(page)
    })
  }

  for (const width of viewports) {
    test(`has no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 })
      await goToDashboard(page)
      await expectNoHorizontalOverflow(page)

      await page.goto('/settings')
      await expectNoHorizontalOverflow(page)
    })
  }

  test('has no horizontal overflow at 200% zoom', async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 844 })
    await goToDashboard(page)
    await page.evaluate(() => {
      document.documentElement.style.zoom = '2'
    })
    await expectNoHorizontalOverflow(page)

    await page.goto('/settings')
    await expectNoHorizontalOverflow(page)
  })

  test('honors reduced-motion media preferences', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/login')

    await expect(page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)).resolves.toBe(
      true,
    )
    const transitionDuration = await page.getByRole('button', { name: 'Sign in', exact: true }).evaluate(
      (button) => getComputedStyle(button).transitionDuration,
    )
    expect(transitionDuration).toMatch(/0\.01ms|1e-05s|0s/)
  })
})