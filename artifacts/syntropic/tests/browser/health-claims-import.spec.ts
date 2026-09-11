import { test, expect, type Locator, type Page } from '@playwright/test'
import type { HealthClaimReviewField } from '../../lib/health-claim-review-fields'
import { MEDICARE_REVIEW_FIELDS, PRIVATE_HEALTH_REVIEW_FIELDS } from '../../lib/health-claim-review-fields'

const progress = {
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
}

type ReviewFixture = {
  id: string
  kind: 'medicare' | 'private_health'
  fileName: string
  rowId: string
  rowNumber: number
  data: Record<string, string | number>
  fields: readonly HealthClaimReviewField[]
}

const reviewFixtures: Record<'medicare' | 'private_health', ReviewFixture> = {
  medicare: {
    id: 'medicare-review-controls-browser',
    kind: 'medicare',
    fileName: 'medicare-review-controls.csv',
    rowId: 'medicare-review-row',
    rowNumber: 3,
    data: {
      serviceDate: '2026-09-08',
      description: 'Initial Medicare description',
      provider: 'Initial Medicare provider',
      itemNumber: 'ITEM-001',
      feeCharged: 123.45,
      benefitPaid: 100,
      outOfPocket: 23.45,
    },
    fields: MEDICARE_REVIEW_FIELDS,
  },
  private_health: {
    id: 'private-health-review-controls-browser',
    kind: 'private_health',
    fileName: 'private-health-review-controls.csv',
    rowId: 'private-health-review-row',
    rowNumber: 8,
    data: {
      serviceDate: '2026-09-08',
      description: 'Initial private-health description',
      provider: 'Initial private-health provider',
      claimNumber: 'PRIVATE-001',
      chargedAmount: 2345.67,
      benefitAmount: 1800.12,
      outOfPocket: 545.55,
    },
    fields: PRIVATE_HEALTH_REVIEW_FIELDS,
  },
}

async function mockReviewImport(page: Page, fixture: ReviewFixture) {
  await page.route('**/api/medicare-claims**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      claims: [],
      appointments: [],
      year: 2026,
      progress,
      progressWithForecast: progress,
      forecastOop: 0,
    }),
  }))
  await page.route('**/api/phi-policies', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([]),
  }))
  await page.route('**/api/organisations', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([]),
  }))
  await page.route(/\/api\/health-claims\/import(?:\/.*)?$/, async (route) => {
    const requestUrl = new URL(route.request().url())
    if (requestUrl.pathname.endsWith('/import')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: fixture.id,
          kind: fixture.kind,
          fileName: fixture.fileName,
          contentType: 'text/csv',
          byteSize: 512,
          sha256: 'c'.repeat(64),
          status: 'review',
          detectedFields: Object.keys(fixture.data),
          parseErrors: [],
          _count: { rows: 1 },
        }]),
      })
      return
    }

    if (!requestUrl.pathname.endsWith(`/${fixture.id}`)) return

    const detail = {
      id: fixture.id,
      kind: fixture.kind,
      fileName: fixture.fileName,
      contentType: 'text/csv',
      byteSize: 512,
      sha256: 'c'.repeat(64),
      status: 'review',
      detectedFields: Object.keys(fixture.data),
      parseErrors: [],
      auditEvents: [],
      rows: [{
        id: fixture.rowId,
        rowNumber: fixture.rowNumber,
        data: fixture.data,
        errors: [],
        status: 'valid',
      }],
    }

    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON() as { rows: Array<Record<string, unknown>> }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...detail,
          rows: body.rows.map((row) => ({
            ...row,
            rowNumber: fixture.rowNumber,
            errors: [],
          })),
        }),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(detail),
    })
  })
}

function reviewInput(dialog: Locator, label: string) {
  return dialog.locator('label').filter({ hasText: label }).locator('..').locator('input')
}

async function openReviewImport(page: Page, fixture: ReviewFixture) {
  await mockReviewImport(page, fixture)
  await page.goto('/health-funding')
  await expect(page.getByRole('heading', { name: 'Health Funding', exact: true })).toBeVisible()
  await page.getByRole('button', {
    name: new RegExp(`${fixture.kind === 'medicare' ? 'Medicare' : 'Private health'} · ${fixture.fileName}`),
  }).click()
  const dialog = page.getByRole('dialog', {
    name: fixture.kind === 'medicare' ? 'Import Medicare claims' : 'Import private health claims',
  })
  await expect(dialog).toBeVisible()
  return dialog
}

async function expectReviewFields(
  dialog: Locator,
  fields: readonly HealthClaimReviewField[],
) {
  for (const field of fields) {
    const label = dialog.locator('label').filter({ hasText: field.label })
    await expect(label).toHaveCount(1)
    const input = label.locator('..').locator('input')
    await expect(input).toHaveCount(1)
    await expect(input).toHaveAttribute('type', field.inputType)
  }
}

async function expectEditedReviewValues(
  page: Page,
  dialog: Locator,
  fixture: ReviewFixture,
  edits: { textLabel: string; text: string; date: string; amountLabel: string; amount: string },
) {
  await reviewInput(dialog, edits.textLabel).fill(edits.text)
  await reviewInput(dialog, 'Service date').fill(edits.date)
  await reviewInput(dialog, edits.amountLabel).fill(edits.amount)

  const saveRequestPromise = page.waitForRequest((request) => (
    request.method() === 'PATCH'
    && request.url().endsWith(`/api/health-claims/import/${fixture.id}`)
  ))
  await dialog.getByRole('button', { name: 'Save changes' }).click()
  const saveRequest = await saveRequestPromise
  const body = saveRequest.postDataJSON() as { action: string; rows: Array<{ id: string; data: Record<string, unknown> }> }

  expect(body.action).toBe('save')
  expect(body.rows).toHaveLength(1)
  expect(body.rows[0]).toMatchObject({
    id: fixture.rowId,
    data: {
      description: edits.text,
      serviceDate: edits.date,
      [fixture.kind === 'medicare' ? 'feeCharged' : 'chargedAmount']: edits.amount,
    },
  })
  await expect(dialog).toContainText('Changes saved.')
}

test('Medicare claim review renders every editable control and saves edited values', async ({ page }) => {
  const fixture = reviewFixtures.medicare
  const dialog = await openReviewImport(page, fixture)

  await expectReviewFields(dialog, fixture.fields)
  await expectEditedReviewValues(page, dialog, fixture, {
    textLabel: 'Description',
    text: 'Updated Medicare description',
    date: '2026-09-10',
    amountLabel: 'Charged',
    amount: '987.65',
  })
})

test('private-health claim review renders every editable control and saves edited values', async ({ page }) => {
  const fixture = reviewFixtures.private_health
  const dialog = await openReviewImport(page, fixture)

  await expectReviewFields(dialog, fixture.fields)
  await expectEditedReviewValues(page, dialog, fixture, {
    textLabel: 'Description',
    text: 'Updated private-health description',
    date: '2026-09-11',
    amountLabel: 'Charged',
    amount: '3456.78',
  })
})

test('restored claim audit history shows safe field labels without claim content', async ({ page }) => {
  const restoredImportId = 'health-import-restored-browser'
  const claimDescription = 'Private claim value must stay out of audit history'
  const uploadedContent = 'UPLOADED_STATEMENT_CONTENT_MUST_STAY_PRIVATE'

  await page.route('**/api/medicare-claims**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      claims: [],
      year: 2026,
      progress,
      progressWithForecast: progress,
      forecastOop: 0,
    }),
  }))
  await page.route('**/api/phi-policies', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([]),
  }))
  await page.route('**/api/organisations', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([]),
  }))
  await page.route(/\/api\/health-claims\/import(?:\/.*)?$/, async (route) => {
    const requestUrl = new URL(route.request().url())
    if (requestUrl.pathname.endsWith('/import')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: restoredImportId,
          kind: 'medicare',
          fileName: 'restored-claims.csv',
          contentType: 'text/csv',
          byteSize: 512,
          sha256: 'a'.repeat(64),
          status: 'review',
          detectedFields: ['description', 'provider'],
          parseErrors: [],
          _count: { rows: 2 },
        }]),
      })
      return
    }

    if (requestUrl.pathname.endsWith(`/${restoredImportId}`)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: restoredImportId,
          kind: 'medicare',
          fileName: 'restored-claims.csv',
          contentType: 'text/csv',
          byteSize: uploadedContent.length,
          sha256: 'a'.repeat(64),
          status: 'review',
          detectedFields: ['description', 'provider'],
          parseErrors: [],
          rows: [
            {
              id: 'restored-row-with-fields',
              rowNumber: 3,
              data: {
                serviceDate: '2026-09-08',
                description: claimDescription,
                provider: 'Private provider value',
                feeCharged: 123.45,
              },
              errors: [],
              status: 'valid',
            },
            {
              id: 'restored-row-without-fields',
              rowNumber: 4,
              data: {
                serviceDate: '2026-09-07',
                description: 'Second private claim value',
                provider: 'Second private provider value',
                feeCharged: 67.89,
              },
              errors: [],
              status: 'valid',
            },
          ],
          auditEvents: [
            {
              id: 'audit-restored-with-fields',
              action: 'row_included',
              rowNumber: 3,
              previousStatus: 'excluded',
              nextStatus: 'valid',
              changedFields: ['description', 'provider', 'feeCharged'],
              actorUserId: 'browser-test-user',
              actor: { name: 'Test owner' },
              createdAt: '2026-09-09T00:00:00.000Z',
            },
            {
              id: 'audit-restored-without-fields',
              action: 'row_included',
              rowNumber: 4,
              previousStatus: 'excluded',
              nextStatus: 'valid',
              changedFields: [],
              actorUserId: 'browser-test-user',
              actor: { name: 'Test owner' },
              createdAt: '2026-09-09T00:01:00.000Z',
            },
          ],
        }),
      })
      return
    }

  })

  const expectSafeAuditHistory = async () => {
    const dialog = page.getByRole('dialog', { name: 'Import Medicare claims' })
    await expect(dialog).toBeVisible()
    await dialog.getByTestId('button-toggle-health-claim-audit').click()

    const auditHistory = dialog.getByTestId('list-health-claim-audit')
    await expect(auditHistory).toBeVisible()

    const restoredWithFields = auditHistory.getByTestId('audit-event-audit-restored-with-fields')
    await expect(restoredWithFields).toContainText('Row included')
    await expect(restoredWithFields).toContainText('Changed fields: Description, Provider, Charged amount')
    await expect(restoredWithFields).not.toContainText(claimDescription)
    await expect(restoredWithFields).not.toContainText('Private provider value')
    await expect(restoredWithFields).not.toContainText(uploadedContent)

    const restoredWithoutFields = auditHistory.getByTestId('audit-event-audit-restored-without-fields')
    await expect(restoredWithoutFields).toContainText('Row included')
    await expect(restoredWithoutFields).toContainText('Row 4')
    await expect(restoredWithoutFields).not.toContainText('Changed fields:')
    await expect(restoredWithoutFields).not.toContainText('Second private claim value')
    await expect(restoredWithoutFields).not.toContainText('Second private provider value')
    await expect(restoredWithoutFields).not.toContainText(uploadedContent)
  }

  await page.goto('/health-funding')
  await expect(page.getByRole('heading', { name: 'Health Funding', exact: true })).toBeVisible()
  const detailResponse = page.waitForResponse((response) => (
    response.url().endsWith(`/api/health-claims/import/${restoredImportId}`)
  ))
  await page.getByRole('button', { name: /Medicare · restored-claims\.csv/ }).click()
  expect((await detailResponse).status()).toBe(200)
  await expectSafeAuditHistory()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Health Funding', exact: true })).toBeVisible()
  const reloadedDetailResponse = page.waitForResponse((response) => (
    response.url().endsWith(`/api/health-claims/import/${restoredImportId}`)
  ))
  await page.getByRole('button', { name: /Medicare · restored-claims\.csv/ }).click()
  expect((await reloadedDetailResponse).status()).toBe(200)
  await expectSafeAuditHistory()
})

test('private-health restored audit history stays value-free', async ({ page }) => {
  const restoredImportId = 'private-health-import-restored-browser'
  const claimDescription = 'Private hospital claim value must stay out of audit history'
  const uploadedContent = 'UPLOADED_PRIVATE_HEALTH_STATEMENT_MUST_STAY_PRIVATE'

  await page.route('**/api/medicare-claims**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      claims: [],
      year: 2026,
      progress,
      progressWithForecast: progress,
      forecastOop: 0,
    }),
  }))
  await page.route('**/api/phi-policies', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([]),
  }))
  await page.route('**/api/organisations', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([]),
  }))
  await page.route(/\/api\/health-claims\/import(?:\/.*)?$/, async (route) => {
    const requestUrl = new URL(route.request().url())
    if (requestUrl.pathname.endsWith('/import')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: restoredImportId,
          kind: 'private_health',
          fileName: 'restored-private-claims.csv',
          contentType: 'text/csv',
          byteSize: 768,
          sha256: 'b'.repeat(64),
          status: 'review',
          detectedFields: ['claimNumber', 'serviceDate', 'provider', 'chargedAmount'],
          parseErrors: [],
          _count: { rows: 2 },
        }]),
      })
      return
    }

    if (requestUrl.pathname.endsWith(`/${restoredImportId}`)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: restoredImportId,
          kind: 'private_health',
          fileName: 'restored-private-claims.csv',
          contentType: 'text/csv',
          byteSize: uploadedContent.length,
          sha256: 'b'.repeat(64),
          status: 'review',
          detectedFields: ['claimNumber', 'serviceDate', 'provider', 'chargedAmount'],
          parseErrors: [],
          rows: [
            {
              id: 'private-restored-row-with-fields',
              rowNumber: 8,
              data: {
                claimNumber: 'PRIVATE-CLAIM-001',
                serviceDate: '2026-09-08',
                provider: 'Private hospital value',
                serviceType: 'Inpatient treatment value',
                description: claimDescription,
                itemNumber: 'ITEM-PRIVATE-001',
                chargedAmount: 2345.67,
                benefitAmount: 1800.12,
                outOfPocket: 545.55,
                benefitDetail: 'Private benefit detail value',
                claimStatus: 'Paid value',
              },
              errors: [],
              status: 'valid',
            },
            {
              id: 'private-restored-row-without-fields',
              rowNumber: 9,
              data: {
                claimNumber: 'PRIVATE-CLAIM-002',
                serviceDate: '2026-09-07',
                provider: 'Second private provider value',
                serviceType: 'Second private service value',
                description: 'Second private-health claim value',
                itemNumber: 'ITEM-PRIVATE-002',
                chargedAmount: 678.9,
                benefitAmount: 500,
                outOfPocket: 178.9,
                benefitDetail: 'Second private benefit detail value',
                claimStatus: 'Submitted value',
              },
              errors: [],
              status: 'valid',
            },
          ],
          auditEvents: [
            {
              id: 'audit-private-restored-with-fields',
              action: 'row_included',
              rowNumber: 8,
              previousStatus: 'excluded',
              nextStatus: 'valid',
              changedFields: ['claimNumber', 'serviceDate', 'provider', 'serviceType', 'description', 'chargedAmount', 'benefitAmount', 'outOfPocket', 'claimStatus'],
              actorUserId: 'browser-test-user',
              actor: { name: 'Test owner' },
              createdAt: '2026-09-09T00:00:00.000Z',
            },
            {
              id: 'audit-private-restored-without-fields',
              action: 'row_included',
              rowNumber: 9,
              previousStatus: 'excluded',
              nextStatus: 'valid',
              changedFields: [],
              actorUserId: 'browser-test-user',
              actor: { name: 'Test owner' },
              createdAt: '2026-09-09T00:01:00.000Z',
            },
          ],
        }),
      })
    }
  })

  await page.goto('/health-funding')
  await expect(page.getByRole('heading', { name: 'Health Funding', exact: true })).toBeVisible()
  const detailResponse = page.waitForResponse((response) => (
    response.url().endsWith(`/api/health-claims/import/${restoredImportId}`)
  ))
  await page.getByRole('button', { name: /Private health · restored-private-claims\.csv/ }).click()
  expect((await detailResponse).status()).toBe(200)

  const dialog = page.getByRole('dialog', { name: 'Import private health claims' })
  await expect(dialog).toBeVisible()
  await dialog.getByTestId('button-toggle-health-claim-audit').click()

  const auditHistory = dialog.getByTestId('list-health-claim-audit')
  await expect(auditHistory).toBeVisible()

  const restoredWithFields = auditHistory.getByTestId('audit-event-audit-private-restored-with-fields')
  await expect(restoredWithFields).toContainText('Row included')
  await expect(restoredWithFields).toContainText(
    'Changed fields: Claim number, Service date, Provider, Service type, Description, Charged amount, Benefit amount, Out-of-pocket, Claim status',
  )
  for (const sensitiveValue of [
    'PRIVATE-CLAIM-001',
    claimDescription,
    'Private hospital value',
    'Inpatient treatment value',
    '2345.67',
    '1800.12',
    '545.55',
    'Paid value',
    uploadedContent,
  ]) {
    await expect(restoredWithFields).not.toContainText(sensitiveValue)
  }

  const restoredWithoutFields = auditHistory.getByTestId('audit-event-audit-private-restored-without-fields')
  await expect(restoredWithoutFields).toContainText('Row included')
  await expect(restoredWithoutFields).toContainText('Row 9')
  await expect(restoredWithoutFields).not.toContainText('Changed fields:')
  for (const sensitiveValue of [
    'PRIVATE-CLAIM-002',
    'Second private-health claim value',
    'Second private provider value',
    'Second private service value',
    '678.9',
    '500',
    '178.9',
    'Submitted value',
    uploadedContent,
  ]) {
    await expect(restoredWithoutFields).not.toContainText(sensitiveValue)
  }
})

test('removed claim sources explain report exclusion after reload and stay private', async ({ page }) => {
  const removedImportId = 'health-import-removed-browser'
  const removedFileName = 'removed-source-private.csv'
  const removedSha = 'b'.repeat(64)
  const removedAt = '2026-09-09T00:00:00.000Z'

  const mockHealthFundingDependencies = async (targetPage: typeof page) => {
    await targetPage.route('**/api/medicare-claims**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        claims: [],
        year: 2026,
        progress,
        progressWithForecast: progress,
        forecastOop: 0,
      }),
    }))
    await targetPage.route('**/api/phi-policies', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    }))
    await targetPage.route('**/api/organisations', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    }))
  }

  await mockHealthFundingDependencies(page)
  await page.route(/\/api\/health-claims\/import(?:\/.*)?$/, async (route) => {
    const requestUrl = new URL(route.request().url())
    if (requestUrl.pathname.endsWith('/import')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: removedImportId,
          kind: 'medicare',
          status: 'review',
          deletedAt: removedAt,
          createdAt: '2026-09-08T00:00:00.000Z',
          updatedAt: removedAt,
          removalReason: 'source_removed',
        }]),
      })
      return
    }
    if (requestUrl.pathname.endsWith(`/${removedImportId}`)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: removedImportId,
          kind: 'medicare',
          status: 'review',
          deletedAt: removedAt,
          createdAt: '2026-09-08T00:00:00.000Z',
          updatedAt: removedAt,
          removalReason: 'source_removed',
        }),
      })
    }
  })

  await page.goto('/health-funding')
  await expect(page.getByRole('heading', { name: 'Health Funding', exact: true })).toBeVisible()
  const detailResponse = page.waitForResponse((response) => (
    response.url().endsWith(`/api/health-claims/import/${removedImportId}`)
  ))
  await expect(page.getByRole('button', { name: /Medicare source removed/ })).toBeVisible()
  await page.getByRole('button', { name: /Medicare source removed/ }).click()
  const detail = await (await detailResponse).json()
  expect(detail).not.toHaveProperty('rows')
  expect(detail).not.toHaveProperty('auditEvents')
  expect(detail).not.toHaveProperty('fileName')
  expect(detail).not.toHaveProperty('sha256')
  await expect(page.getByTestId('health-import-removed-message')).toContainText('was removed and is no longer included in reports')
  await expect(page.getByTestId('health-import-removed-message')).toContainText('Confirmed claims remain in your health history')
  await expect(page.getByTestId('health-import-removed-message')).not.toContainText(removedFileName)
  await expect(page.getByTestId('health-import-removed-message')).not.toContainText(removedSha)

  await page.reload()
  await expect(page.getByRole('button', { name: /Medicare source removed/ })).toBeVisible()
  await page.getByRole('button', { name: /Medicare source removed/ }).click()
  await expect(page.getByTestId('health-import-removed-message')).toBeVisible()

  const otherPage = await page.context().newPage()
  await mockHealthFundingDependencies(otherPage)
  await otherPage.route(/\/api\/health-claims\/import(?:\/.*)?$/, async (route) => {
    const requestUrl = new URL(route.request().url())
    if (requestUrl.pathname.endsWith('/import')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      return
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: { code: 'NOT_FOUND' } }) })
  })
  await otherPage.goto('/health-funding')
  await expect(otherPage.getByRole('heading', { name: 'Health Funding', exact: true })).toBeVisible()
  await expect(otherPage.getByRole('button', { name: /Medicare source removed/ })).toHaveCount(0)
  expect(await otherPage.evaluate(async (id) => (await fetch(`/api/health-claims/import/${id}`)).status, removedImportId)).toBe(404)
  await otherPage.close()
})