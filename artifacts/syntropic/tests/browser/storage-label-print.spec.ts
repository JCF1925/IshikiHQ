import { expect, test, type Page } from '@playwright/test'

const householdId = 'browser-storage-label-household'
const labelCount = 30

const layouts = [
  {
    id: 'plain',
    name: 'Plain paper',
    pageSize: 'letter',
    pageWidth: '8.5in',
    pageHeight: '11in',
    labelWidth: '2.35in',
    labelHeight: '2.25in',
    qrSize: '1.1in',
    labelsPerPage: 12,
    expectedPageCounts: [12, 12, 6],
  },
  {
    id: 'avery-5160',
    name: 'Avery 5160 / 8160',
    pageSize: 'letter',
    pageWidth: '8.5in',
    pageHeight: '11in',
    labelWidth: '2.625in',
    labelHeight: '1in',
    qrSize: '0.72in',
    labelsPerPage: 30,
    expectedPageCounts: [30],
  },
  {
    id: 'avery-l7163',
    name: 'Avery L7163',
    pageSize: 'a4',
    pageWidth: '210mm',
    pageHeight: '297mm',
    labelWidth: '99.1mm',
    labelHeight: '38.1mm',
    qrSize: '0.82in',
    labelsPerPage: 14,
    expectedPageCounts: [14, 14, 2],
  },
  {
    id: 'avery-l7160',
    name: 'Avery L7160',
    pageSize: 'a4',
    pageWidth: '210mm',
    pageHeight: '297mm',
    labelWidth: '63.5mm',
    labelHeight: '38.1mm',
    qrSize: '0.76in',
    labelsPerPage: 21,
    expectedPageCounts: [21, 9],
  },
] as const

const storageData = {
  locations: [{ id: 'storage-location', name: 'Release check location' }],
  containers: [],
  items: Array.from({ length: labelCount }, (_, index) => ({
    id: `storage-item-${index + 1}`,
    name: `Release check item ${index + 1}`,
    locationId: 'storage-location',
    labels: [],
    quantity: 1,
    unit: 'pcs',
  })),
}

async function stubStorageApis(page: Page) {
  await page.route(/\/api\/households(?:\/.*)?$/, async (route) => {
    const url = new URL(route.request().url())

    if (url.pathname === '/api/households') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          contexts: [{
            id: householdId,
            name: 'Release check household',
            kind: 'household',
            membershipId: 'release-check-membership',
            role: 'owner',
          }],
        }),
      })
    }

    if (url.pathname === `/api/households/${householdId}/storage`) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(storageData),
      })
    }

    if (url.pathname === `/api/households/${householdId}/storage/labels`) {
      if (route.request().method() === 'POST') {
        const requestBody = route.request().postDataJSON() as {
          selections: Array<{ type: 'item' | 'container'; id: string; displayText: string }>
        }

        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            labels: requestBody.selections.map((selection, index) => ({
              ...selection,
              referenceId: `release-check-reference-${index + 1}`,
              resourceId: selection.id,
              token: `release-check-token-${index + 1}`,
              path: `/storage/qr/release-check-token-${index + 1}`,
            })),
          }),
        })
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ labels: [] }),
      })
    }

    return route.fallback()
  })

  await page.route('**/api/storage/qr/preflight', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ valid: true, invalidIndexes: [] }),
  }))
}

async function prepareLabelSheet(page: Page, layoutName: string) {
  await page.goto('/storage')
  await expect(page.getByRole('heading', { name: 'Storage & Belongings', exact: true })).toBeVisible()

  const selectionCheckboxes = page.getByRole('checkbox', { name: /Select .* for label printing/ })
  await expect(selectionCheckboxes).toHaveCount(labelCount)
  await selectionCheckboxes.evaluateAll((checkboxes) => {
    for (const checkbox of checkboxes) {
      if (!(checkbox as HTMLInputElement).checked) {
        ;(checkbox as HTMLElement).click()
      }
    }
  })

  await page.getByRole('button', { name: `Print selected (${labelCount})`, exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Print storage labels' })
  await expect(dialog).toBeVisible()

  const layoutSelect = dialog.getByRole('combobox', { name: 'Label sheet' })
  await layoutSelect.click()
  await page.getByRole('option', { name: new RegExp(`^${layoutName} —`) }).click()
  await dialog.getByRole('button', { name: 'Prepare sheet', exact: true }).click()
  await expect(dialog.locator('.storage-label-sheet')).toBeVisible()

  return dialog
}

async function expectPrintLayout(dialog: ReturnType<Page['getByRole']>, layout: (typeof layouts)[number]) {
  await dialog.locator('.storage-label-sheet').evaluate((sheet, expected) => {
    const style = (sheet as HTMLElement).style
    for (const [property, value] of Object.entries(expected.variables)) {
      if (style.getPropertyValue(property) !== value) {
        throw new Error(`Expected ${property} to be ${value}, got ${style.getPropertyValue(property)}`)
      }
    }
  }, {
    variables: {
      '--sheet-page-width': layout.pageWidth,
      '--sheet-page-height': layout.pageHeight,
      '--label-width': layout.labelWidth,
      '--label-height': layout.labelHeight,
      '--label-qr-size': layout.qrSize,
    },
  })

  const metrics = await dialog.locator('.storage-label-sheet').evaluate((sheet, expected) => {
    const pages = Array.from(sheet.querySelectorAll<HTMLElement>('.storage-label-page'))
    const pageCounts = pages.map((labelPage) => labelPage.querySelectorAll('.storage-print-label').length)
    const parseLengthInPixels = (value: string) => {
      const probe = document.createElement('div')
      probe.style.width = value
      probe.style.position = 'absolute'
      probe.style.visibility = 'hidden'
      document.body.appendChild(probe)
      const pixels = probe.getBoundingClientRect().width
      probe.remove()
      return pixels
    }
    const expectedWidth = parseLengthInPixels(expected.pageWidth)
    const expectedHeight = parseLengthInPixels(expected.pageHeight)
    const pageBoxes = pages.map((labelPage) => {
      const box = labelPage.getBoundingClientRect()
      return { width: box.width, height: box.height }
    })
    const labelBoxes = Array.from(sheet.querySelectorAll<HTMLElement>('.storage-print-label'))
      .map((label) => {
        const box = label.getBoundingClientRect()
        return { width: box.width, height: box.height }
      })
    const qrWidths = Array.from(sheet.querySelectorAll<SVGElement>('.storage-print-qr'))
      .map((qr) => qr.getBoundingClientRect().width)
    const minimumQrWidth = parseLengthInPixels('0.72in')
    const preview = sheet.closest('.storage-label-preview') as HTMLElement | null

    return {
      pageCounts,
      pageBoxes,
      expectedWidth,
      expectedHeight,
      expectedLabelWidth: parseLengthInPixels(expected.labelWidth),
      expectedLabelHeight: parseLengthInPixels(expected.labelHeight),
      labelBoxes,
      qrWidths,
      minimumQrWidth,
      bodyScrollWidth: document.body.scrollWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      previewScrollWidth: preview?.scrollWidth ?? 0,
      previewClientWidth: preview?.clientWidth ?? 0,
      pageSize: pages[0]?.dataset.pageSize,
    }
  }, layout)

  expect(metrics.pageCounts).toEqual(layout.expectedPageCounts)
  expect(metrics.pageSize).toBe(layout.pageSize)
  for (const pageBox of metrics.pageBoxes) {
    expect(Math.abs(pageBox.width - metrics.expectedWidth)).toBeLessThan(1)
    expect(Math.abs(pageBox.height - metrics.expectedHeight)).toBeLessThan(1)
  }
  for (const labelBox of metrics.labelBoxes) {
    expect(Math.abs(labelBox.width - metrics.expectedLabelWidth)).toBeLessThan(1)
    expect(Math.abs(labelBox.height - metrics.expectedLabelHeight)).toBeLessThan(1)
  }
  for (const qrWidth of metrics.qrWidths) {
    expect(qrWidth).toBeGreaterThanOrEqual(metrics.minimumQrWidth - 0.5)
  }
  expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.viewportWidth)
  expect(metrics.documentScrollWidth).toBeLessThanOrEqual(metrics.viewportWidth)
  expect(metrics.previewScrollWidth).toBeLessThanOrEqual(metrics.previewClientWidth)
}

test.describe('storage label print release checks', () => {
  for (const layout of layouts) {
    test(`${layout.name} keeps physical label alignment in print mode`, async ({ page }) => {
      await stubStorageApis(page)
      const dialog = await prepareLabelSheet(page, layout.name)

      const guidance = dialog.getByText(/QR codes are kept at least 0\.72 in wide/)
      await expect(guidance).toBeVisible()
      await expect(guidance).toContainText('Actual size')
      await expect(guidance).toContainText('100% scale')

      await page.emulateMedia({ media: 'print' })
      await expectPrintLayout(dialog, layout)
    })
  }
})