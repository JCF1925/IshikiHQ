import { test as setup, expect } from '@playwright/test'

const testEmail = process.env.SYNTROPIC_E2E_EMAIL ?? 'abacus-e9442339@example.com'
const testPassword = process.env.SYNTROPIC_E2E_PASSWORD ?? 'Syntropic!Test2026'

setup('authenticate the release-gate browser session', async ({ page }) => {
  await page.goto('/login')
  await page.evaluate(async () => {
    await fetch('/api/auth/csrf', { credentials: 'same-origin' })
  })
  await page.getByLabel('Email').fill(testEmail)
  await page.getByLabel('Password').fill(testPassword)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/(?:\?.*)?$/)
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
  await page.context().storageState({ path: 'test-results/.auth/user.json' })
})