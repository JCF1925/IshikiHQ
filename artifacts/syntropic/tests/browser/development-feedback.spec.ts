import { test, expect } from '@playwright/test'

const authoritativeUrl = 'https://docs.google.com/spreadsheets/d/authoritative-sheet'
const searchUrl = 'https://drive.google.com/drive/u/0/search?q=%22Ishiki%20Development%20Improvements%22'

function feedbackRow(rowNumber: number, summary: string) {
  return {
    rowNumber,
    submittedAt: '2026-09-10T09:00:00.000Z',
    status: 'New',
    priority: 'medium',
    category: 'improvement',
    summary,
    details: `${summary} details`,
    expectedOutcome: `${summary} outcome`,
    page: '/dashboard',
    tester: 'browser-test@example.com',
  }
}

test('authenticated owner can see feedback sheet recovery guidance', async ({ page }) => {
  await page.route('**/api/development-feedback', async (route) => {
    expect(route.request().method()).toBe('GET')
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        authoritative: {
          spreadsheetId: 'authoritative-sheet',
          spreadsheetUrl: authoritativeUrl,
          source: 'persisted',
          title: 'Ishiki Development Improvements',
          worksheetName: 'Improvements',
        },
        likelyOlderSheets: {
          title: 'Ishiki Development Improvements',
          worksheetName: 'Improvements',
          searchUrl,
          guidance: 'Search Google Drive for the exact title, then compare each Improvements tab with the authoritative sheet before recovering any rows.',
        },
        recovery: {
          preservesRows: true,
          requiresExplicitConfirmation: true,
          guidance: 'Do not delete or consolidate a candidate automatically. Review and copy any missing rows to the authoritative sheet first, then get explicit owner confirmation before any deletion or consolidation.',
        },
      }),
    })
  })

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Suggest an improvement while testing', exact: true }).click()

  const dialog = page.getByRole('dialog', { name: 'Suggest an improvement' })
  await expect(dialog).toBeVisible()

  const authoritativeLink = dialog.getByRole('link', { name: /Open authoritative/ })
  await expect(authoritativeLink).toContainText('Ishiki Development Improvements')
  await expect(authoritativeLink).toHaveAttribute('href', authoritativeUrl)

  const searchLink = dialog.getByRole('link', {
    name: 'Search Drive for likely older “Ishiki Development Improvements” sheets',
  })
  await expect(searchLink).toHaveAttribute('href', searchUrl)
  await expect(dialog).toContainText('missing rows')
  await expect(dialog).toContainText('Do not delete or consolidate')
  await expect(dialog).toContainText('explicit owner confirmation')
})

test('feedback submission remains available when sheet lookup fails', async ({ page }) => {
  const providerError = 'Google Sheets API request failed for spreadsheet provider-sheet-id'

  await page.route('**/api/development-feedback', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: providerError } }),
      })
      return
    }

    expect(route.request().method()).toBe('POST')
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    })
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'Suggest an improvement while testing', exact: true }).click()

  const dialog = page.getByRole('dialog', { name: 'Suggest an improvement' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Checking the current sheet…')).toBeHidden()
  await expect(dialog).not.toContainText(providerError)

  const summary = dialog.getByLabel('Summary')
  const details = dialog.getByLabel('What did you notice?')
  const submit = dialog.getByRole('button', { name: 'Add to testing sheet' })

  await expect(summary).toBeEnabled()
  await expect(details).toBeEnabled()
  await expect(submit).toBeDisabled()

  await summary.fill('Keep feedback available')
  await details.fill('The sheet lookup failed temporarily, but this report should still submit.')
  await expect(submit).toBeEnabled()

  const submission = page.waitForRequest((request) => (
    request.url().includes('/api/development-feedback') && request.method() === 'POST'
  ))
  await submit.click()
  await submission
  await expect(dialog).toBeHidden()
})

test('reopening feedback clears stale sheet links while status refreshes', async ({ page }) => {
  const oldAuthoritativeUrl = 'https://docs.google.com/spreadsheets/d/old-authoritative-sheet'
  const oldSearchUrl = 'https://drive.google.com/drive/u/0/search?q=old-feedback-sheet'
  let lookupCount = 0
  let releaseSecondLookup: (() => void) | undefined
  let secondLookupStartedResolve: (() => void) | undefined
  const secondLookupStarted = new Promise<void>((resolve) => {
    secondLookupStartedResolve = resolve
  })

  await page.route('**/api/development-feedback', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue()
      return
    }

    lookupCount += 1
    if (lookupCount === 1) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          authoritative: {
            spreadsheetId: 'old-authoritative-sheet',
            spreadsheetUrl: oldAuthoritativeUrl,
            source: 'persisted',
            title: 'Old feedback sheet',
            worksheetName: 'Improvements',
          },
          likelyOlderSheets: {
            title: 'Old feedback sheet',
            worksheetName: 'Improvements',
            searchUrl: oldSearchUrl,
            guidance: 'Old Drive guidance',
          },
          recovery: {
            preservesRows: true,
            requiresExplicitConfirmation: true,
            guidance: 'Old recovery guidance',
          },
        }),
      })
      return
    }

    secondLookupStartedResolve?.()
    await new Promise<void>((resolve) => {
      releaseSecondLookup = resolve
    })
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: { message: 'Refresh unavailable' } }),
    })
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'Suggest an improvement while testing', exact: true }).click()

  const dialog = page.getByRole('dialog', { name: 'Suggest an improvement' })
  await expect(dialog.getByRole('link', { name: /Open authoritative/ })).toHaveAttribute('href', oldAuthoritativeUrl)
  await expect(dialog.getByRole('link', { name: /Search Drive for likely older/ })).toHaveAttribute('href', oldSearchUrl)

  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await page.getByRole('button', { name: 'Suggest an improvement while testing', exact: true }).click()
  await secondLookupStarted

  await expect(dialog.getByText('Checking the current sheet…')).toBeVisible()
  await expect(dialog.getByRole('link', { name: /Open authoritative/ })).toHaveCount(0)
  await expect(dialog.getByRole('link', { name: /Search Drive for likely older/ })).toHaveCount(0)
  await expect(dialog).not.toContainText('Old recovery guidance')

  releaseSecondLookup?.()
  await expect(dialog.getByText('Checking the current sheet…')).toBeHidden()
  await expect(dialog.getByRole('link', { name: /Open authoritative/ })).toHaveCount(0)
  await expect(dialog.getByRole('link', { name: /Search Drive for likely older/ })).toHaveCount(0)

  await dialog.getByLabel('Summary').fill('Keep feedback available after refresh')
  await dialog.getByLabel('What did you notice?').fill('The refresh failed but the report should still be available.')
  await expect(dialog.getByRole('button', { name: 'Add to testing sheet' })).toBeEnabled()
})

test('authenticated owner can recover selected candidate rows and refresh duplicate reporting', async ({ page }) => {
  const candidateUrl = 'https://docs.google.com/spreadsheets/d/candidate-sheet'
  const initialCandidateOnly = [
    feedbackRow(7, 'Recover this candidate feedback'),
    feedbackRow(12, 'Leave this candidate feedback selected out'),
  ]
  const refreshedCandidateOnly = [initialCandidateOnly[1]]
  let comparisonRequestCount = 0

  await page.route('**/api/development-feedback**', async (route) => {
    const request = route.request()
    const requestUrl = new URL(request.url())

    if (request.method() === 'GET' && !requestUrl.searchParams.has('candidateSpreadsheetId')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          authoritative: {
            spreadsheetId: 'authoritative-sheet',
            spreadsheetUrl: authoritativeUrl,
            source: 'persisted',
            title: 'Current feedback sheet',
            worksheetName: 'Improvements',
          },
          likelyOlderSheets: {
            title: 'Older feedback sheet',
            worksheetName: 'Improvements',
            searchUrl,
            guidance: 'Compare the older sheet before recovering any rows.',
          },
          recovery: {
            preservesRows: true,
            requiresExplicitConfirmation: true,
            guidance: 'Review selected rows before copying them.',
          },
        }),
      })
      return
    }

    if (request.method() === 'GET' && requestUrl.searchParams.get('candidateSpreadsheetId') === 'candidate-sheet') {
      comparisonRequestCount += 1
      const candidateOnly = comparisonRequestCount === 1 ? initialCandidateOnly : refreshedCandidateOnly
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          comparison: {
            authoritative: {
              spreadsheetId: 'authoritative-sheet',
              spreadsheetUrl: authoritativeUrl,
              source: 'persisted',
              internallyManaged: true,
              title: 'Current feedback sheet',
              worksheetName: 'Improvements',
              rowCount: comparisonRequestCount === 1 ? 10 : 11,
            },
            candidate: {
              spreadsheetId: 'candidate-sheet',
              spreadsheetUrl: candidateUrl,
              source: 'candidate',
              internallyManaged: false,
              title: 'Older feedback sheet',
              worksheetName: 'Improvements',
              rowCount: 12,
            },
            counts: {
              authoritativeRows: comparisonRequestCount === 1 ? 10 : 11,
              candidateRows: 12,
              matchingRows: 9,
              candidateOnlyRows: candidateOnly.length,
              authoritativeOnlyRows: 1,
            },
            candidateOnly,
            authoritativeOnly: [feedbackRow(3, 'Only in the current sheet')],
          },
          recovery: {
            preservesRows: true,
            requiresExplicitConfirmation: true,
            guidance: 'This comparison is read-only.',
          },
        }),
      })
      return
    }

    if (request.method() === 'PATCH') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          recovery: {
            recoveredRows: 1,
            duplicateRows: 1,
          },
        }),
      })
      return
    }

    await route.continue()
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'Suggest an improvement while testing', exact: true }).click()

  const dialog = page.getByRole('dialog', { name: 'Suggest an improvement' })
  await expect(dialog.getByLabel('Older feedback spreadsheet URL or ID')).toBeEnabled()
  await dialog.getByLabel('Older feedback spreadsheet URL or ID').fill('candidate-sheet')
  await dialog.getByRole('button', { name: 'Compare read-only', exact: true }).click()

  await expect(dialog).toContainText('Recover this candidate feedback')
  await expect(dialog).toContainText('Leave this candidate feedback selected out')
  await expect(dialog.getByRole('checkbox', {
    name: 'Select candidate row 7: Recover this candidate feedback',
  })).toBeVisible()

  await dialog.getByRole('checkbox', {
    name: 'Select candidate row 7: Recover this candidate feedback',
  }).click()
  await expect(dialog).toContainText('1 selected')
  await dialog.getByRole('button', { name: 'Review recovery', exact: true }).click()

  const confirmation = page.getByRole('dialog', { name: 'Copy selected feedback rows?' })
  await expect(confirmation).toBeVisible()
  await expect(confirmation).toContainText('Older feedback sheet')
  await expect(confirmation).toContainText('Current feedback sheet')
  await expect(confirmation).toContainText('Improvements')

  const recoveryRequest = page.waitForRequest((request) => (
    new URL(request.url()).pathname.endsWith('/api/development-feedback') &&
    request.method() === 'PATCH'
  ))
  await confirmation.getByRole('button', { name: 'Confirm and copy rows', exact: true }).click()

  const request = await recoveryRequest
  expect(request.postDataJSON()).toEqual({
    action: 'recover',
    candidateSpreadsheetId: 'candidate-sheet',
    authoritativeSpreadsheetId: 'authoritative-sheet',
    selectedRowNumbers: [7],
    confirmed: true,
  })

  await expect(page.getByText('Recovered 1 row; skipped 1 already present')).toBeVisible()
  await expect.poll(() => comparisonRequestCount).toBe(2)
  await expect(dialog.getByText('Rows only in the candidate', { exact: true })).toBeVisible()
  await expect(dialog).toContainText('Leave this candidate feedback selected out')
  await expect(dialog).not.toContainText('Recover this candidate feedback')
})

test('authenticated owner sees a clear first-sheet state while feedback remains usable', async ({ page }) => {
  await page.route('**/api/development-feedback', async (route) => {
    expect(route.request().method()).toBe('GET')
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        authoritative: null,
        likelyOlderSheets: {
          title: 'Ishiki Development Improvements',
          worksheetName: 'Improvements',
          searchUrl,
          guidance: 'Search Google Drive for the exact title, then compare each Improvements tab with the authoritative sheet before recovering any rows.',
        },
        recovery: {
          preservesRows: true,
          requiresExplicitConfirmation: true,
          guidance: 'Do not delete or consolidate a candidate automatically.',
        },
      }),
    })
  })

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Suggest an improvement while testing', exact: true }).click()

  const dialog = page.getByRole('dialog', { name: 'Suggest an improvement' })
  await expect(dialog).toContainText(
    'No authoritative sheet exists for this feedback owner yet. It will be created when the first report is submitted.',
  )
  await expect(dialog.getByRole('link', { name: /Open authoritative/ })).toHaveCount(0)
  await expect(dialog.getByRole('link', { name: /Search Drive for likely older/ })).toHaveCount(0)

  await dialog.getByLabel('Summary').fill('Clarify the empty feedback state')
  await dialog.getByLabel('What did you notice?').fill('The first report should create the testing spreadsheet.')
  await expect(dialog.getByRole('button', { name: 'Add to testing sheet' })).toBeEnabled()
})
