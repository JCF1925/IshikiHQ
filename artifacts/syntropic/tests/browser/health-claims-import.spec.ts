import { test, expect } from '@playwright/test'

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