import { test, expect } from '@playwright/test'

function progressEntry(id: string, day: number, value: number) {
  return {
    id,
    value,
    recordedAt: `2026-09-${String(day).padStart(2, '0')}T00:00:00.000Z`,
    createdAt: `2026-09-${String(day).padStart(2, '0')}T00:00:00.000Z`,
  }
}

test('goal cards keep recent progress visible and page through complete history', async ({ page }) => {
  const historyRequests: string[] = []
  const recentEntries = [5, 4, 3, 2, 1].map((day) => progressEntry(`recent-${day}`, day, day))

  await page.route('**/api/goals', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        id: 'goal-long-history',
        title: 'Read 125 books',
        category: 'personal',
        status: 'active',
        targetValue: 125,
        currentValue: 41,
        unit: 'books',
        targetDate: null,
        milestones: null,
        notes: null,
        progressEntries: recentEntries,
        _count: { progressEntries: 125 },
      }]),
    })
  })
  await page.route('**/api/projects', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await page.route('**/api/goals/goal-long-history**', async (route) => {
    const requestUrl = new URL(route.request().url())
    historyRequests.push(requestUrl.search)
    const currentPage = Number(requestUrl.searchParams.get('page') ?? '1')
    const entries = currentPage === 1
      ? Array.from({ length: 20 }, (_, index) => progressEntry(`history-${index + 1}`, 20 - (index % 20), index + 1))
      : [progressEntry('history-21', 1, 21)]

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'goal-long-history',
        title: 'Read 125 books',
        unit: 'books',
        progressEntries: entries,
        progressEntryCount: 41,
        pagination: {
          page: currentPage,
          pageSize: 20,
          totalEntries: 41,
          totalPages: 3,
          hasPreviousPage: currentPage > 1,
          hasNextPage: currentPage < 3,
        },
      }),
    })
  })

  await page.goto('/goals')
  await expect(page.getByRole('heading', { name: 'Goals & Objectives', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Read 125 books', exact: true })).toBeVisible()

  const card = page.getByRole('heading', { name: 'Read 125 books', exact: true }).locator('xpath=../../..')
  await expect(card).toContainText('Recent progress')
  await expect(card).toContainText('125 entries')
  await expect(card).toContainText('Sep 5, 2026')
  await expect(card.getByRole('button', { name: 'View complete history', exact: true })).toBeVisible()

  await card.getByRole('button', { name: 'View complete history', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Progress history · Read 125 books' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Page 1 of 3 · 41 entries')
  await expect(dialog).toContainText('Sep 1, 2026')
  await expect(historyRequests).toEqual(['?page=1&pageSize=20'])

  await dialog.getByRole('button', { name: 'Next history page', exact: true }).click()
  await expect(dialog).toContainText('Page 2 of 3 · 41 entries')
  await expect(dialog).toContainText('Sep 1, 2026')
  await expect(historyRequests).toEqual([
    '?page=1&pageSize=20',
    '?page=2&pageSize=20',
  ])
})