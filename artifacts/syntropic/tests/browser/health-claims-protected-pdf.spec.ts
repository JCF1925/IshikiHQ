import { test, expect, type Page, type Route } from '@playwright/test'

const protectedPdfMessage =
  'This PDF is encrypted or restricts text extraction, so it cannot be imported safely. Download an unprotected statement, upload a CSV, or enter claims manually.'
const scannedPdfMessage =
  'This scanned Medicare PDF could not be read clearly enough to find claim rows. Try a higher-quality scan or enter claims manually.'
const malformedPdfMessage =
  'This PDF appears incomplete or malformed. Download the statement again or upload a CSV.'

async function json(route: Route, status: number, body: unknown) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

async function installHealthFundingRoutes(page: Page, rejection: { fileName: string; message: string }) {
  await page.route('**/api/**', async (route) => {
    const { pathname } = new URL(route.request().url())
    const method = route.request().method()

    if (pathname === '/api/medicare-claims' && method === 'GET') {
      await json(route, 200, {
        claims: [],
        year: new Date().getUTCFullYear(),
        progress: {
          year: new Date().getUTCFullYear(),
          gapTotal: 0,
          outOfPocketTotal: 0,
          omsnThreshold: 0,
          emsnThreshold: 0,
          omsnMet: false,
          emsnMet: false,
          omsnRemaining: 0,
          emsnRemaining: 0,
          omsnPct: 0,
          emsnPct: 0,
        },
        progressWithForecast: {
          year: new Date().getUTCFullYear(),
          gapTotal: 0,
          outOfPocketTotal: 0,
          omsnThreshold: 0,
          emsnThreshold: 0,
          omsnMet: false,
          emsnMet: false,
          omsnRemaining: 0,
          emsnRemaining: 0,
          omsnPct: 0,
          emsnPct: 0,
        },
        forecastOop: 0,
      })
      return
    }
    if (pathname === '/api/phi-policies' && method === 'GET') {
      await json(route, 200, [])
      return
    }
    if (pathname === '/api/organisations' && method === 'GET') {
      await json(route, 200, [])
      return
    }
    if (pathname === '/api/health-claims/import' && method === 'GET') {
      await json(route, 200, [])
      return
    }
    if (pathname === '/api/health-claims/import' && method === 'POST') {
      await json(route, 201, {
        id: 'rejected-import',
        kind: 'medicare',
        fileName: rejection.fileName,
        contentType: 'application/pdf',
        byteSize: 48,
        sha256: '1234567890abcdef',
        status: 'rejected',
        detectedFields: [],
        parseErrors: [rejection.message],
        rows: [],
        auditEvents: [],
      })
      return
    }

    await route.fallback()
  })
}

test('protected PDFs show safe recovery options without requesting a password', async ({ page }) => {
  await installHealthFundingRoutes(page, { fileName: 'protected-statement.pdf', message: protectedPdfMessage })
  await page.goto('/health-funding')

  await page.getByRole('button', { name: 'Import Medicare', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Import Medicare claims' })
  await expect(dialog).toBeVisible()

  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'protected-statement.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.7\n1 0 obj << /Encrypt 2 0 R >> endobj\n%%EOF'),
  })

  await expect(dialog.getByRole('alert').filter({ hasText: protectedPdfMessage })).toBeVisible()
  const recovery = dialog.getByTestId('health-import-recovery')
  await expect(recovery).toContainText('unprotected')
  await expect(recovery).toContainText('upload a CSV instead')
  await expect(recovery).toContainText('use Add claim to enter each claim manually')
  await expect(dialog.getByLabel(/password/i)).toHaveCount(0)
  await expect(dialog).not.toContainText(/(enter|provide|supply|request)(?: a| the| your)? password/i)
})

test('image-only PDFs explain how to obtain machine-readable data', async ({ page }) => {
  await installHealthFundingRoutes(page, { fileName: 'scanned-statement.pdf', message: scannedPdfMessage })
  await page.goto('/health-funding')

  await page.getByRole('button', { name: 'Import Medicare', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Import Medicare claims' })
  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'scanned-statement.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.7\n%%EOF'),
  })

  await expect(dialog.getByRole('alert').filter({ hasText: scannedPdfMessage })).toBeVisible()
  const recovery = dialog.getByTestId('health-import-recovery')
  await expect(recovery).toContainText('machine-readable PDF')
  await expect(recovery).toContainText('upload a CSV')
  await expect(recovery).toContainText('use Add claim to enter each claim manually')
  await expect(recovery).not.toContainText('unprotected')
})

test('malformed PDFs explain how to retry the download', async ({ page }) => {
  await installHealthFundingRoutes(page, { fileName: 'malformed-statement.pdf', message: malformedPdfMessage })
  await page.goto('/health-funding')

  await page.getByRole('button', { name: 'Import Medicare', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Import Medicare claims' })
  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'malformed-statement.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.7\nbroken'),
  })

  await expect(dialog.getByRole('alert').filter({ hasText: malformedPdfMessage })).toBeVisible()
  const recovery = dialog.getByTestId('health-import-recovery')
  await expect(recovery).toContainText('Download the statement again')
  await expect(recovery).toContainText('opens normally')
  await expect(recovery).toContainText('upload a CSV')
  await expect(recovery).toContainText('use Add claim to enter each claim manually')
  await expect(recovery).not.toContainText('unprotected')
})