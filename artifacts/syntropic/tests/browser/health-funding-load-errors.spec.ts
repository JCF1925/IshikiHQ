import { test, expect } from '@playwright/test'

test('health readers show failures and can retry without appearing empty', async ({ page }) => {
  let medicareShouldFail = true

  await page.route('**/api/medicare-claims**', (route) => route.fulfill(
    medicareShouldFail
      ? { status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'temporary failure' } }) }
      : {
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            claims: [],
            year: 2026,
            progress: {
              year: 2026,
              gapTotal: 0,
              outOfPocketTotal: 0,
              omsnThreshold: 600,
              emsnThreshold: 2000,
              omsnMet: false,
              emsnMet: false,
              omsnRemaining: 600,
              emsnRemaining: 2000,
              omsnPct: 0,
              emsnPct: 0,
            },
            progressWithForecast: {
              year: 2026,
              gapTotal: 0,
              outOfPocketTotal: 0,
              omsnThreshold: 600,
              emsnThreshold: 2000,
              omsnMet: false,
              emsnMet: false,
              omsnRemaining: 600,
              emsnRemaining: 2000,
              omsnPct: 0,
              emsnPct: 0,
            },
            forecastOop: 0,
          }),
        },
  ))
  await page.route('**/api/phi-policies', (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ error: { message: 'temporary failure' } }),
  }))
  await page.route('**/api/organisations', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([]),
  }))
  await page.route('**/api/health-claims/import', (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ error: { message: 'temporary failure' } }),
  }))

  await page.goto('/health-funding')
  await expect(page.getByRole('heading', { name: 'Health Funding', exact: true })).toBeVisible()
  await expect(page.getByRole('alert').filter({ hasText: 'Claim import history could not be loaded' })).toBeVisible()
  await expect(page.getByRole('alert').filter({ hasText: 'Medicare claims could not be loaded' }).first()).toBeVisible()

  medicareShouldFail = false
  const medicareFailure = page.getByRole('alert').filter({ hasText: 'Medicare claims could not be loaded' }).first()
  await medicareFailure.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByText('No claims recorded for 2026.', { exact: true })).toBeVisible()
  await expect(medicareFailure).toHaveCount(0)

  await page.getByRole('tab', { name: 'Private Health' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Private-health policies could not be loaded' })).toBeVisible()
  await expect(page.getByText('No private health policies recorded.', { exact: true })).toHaveCount(0)
})