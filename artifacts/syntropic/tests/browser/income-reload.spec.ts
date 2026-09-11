import { test, expect, type Page } from '@playwright/test'
import { prisma } from '../../lib/db'

type IncomeSource = {
  id: string
  name: string
  amount: number
  frequency: string
  hoursPerWeek: number | null
  baseAnnual: number
}

const today = new Date().toISOString().slice(0, 10)

async function getIncome(page: Page): Promise<IncomeSource[]> {
  const response = await page.request.get('/api/income')
  expect(response.ok()).toBeTruthy()
  return response.json()
}

function currency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'AUD',
  }).format(value)
}

function sourceCard(page: Page, name: string) {
  return page.locator('h3').filter({ hasText: name }).locator('xpath=../../..')
}

async function addIncome(page: Page, values: {
  name: string
  amount: string
  frequency: 'fortnightly' | 'hourly'
  hoursPerWeek?: string
}) {
  await page.getByRole('button', { name: 'Add income', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Add income source' })
  await expect(dialog).toBeVisible()
  const inputs = dialog.locator('input')
  await inputs.nth(0).fill(values.name)
  await inputs.nth(1).fill(values.amount)

  if (values.frequency !== 'fortnightly') {
    await dialog.getByRole('combobox').nth(2).click()
    await page.getByRole('option', { name: 'hourly', exact: true }).click()
    await dialog.locator('input').nth(2).fill(values.hoursPerWeek ?? '38')
  }

  await dialog.getByRole('button', { name: 'Add income', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(sourceCard(page, values.name)).toBeVisible()
}

function incomeFixture(name: string): IncomeSource & Record<string, unknown> {
  return {
    id: `income-${name.replace(/\W+/g, '-').toLowerCase()}`,
    name,
    type: 'salary',
    employerId: null,
    employerName: null,
    amount: 5000,
    frequency: 'fortnightly',
    hoursPerWeek: null,
    isGross: true,
    incSuper: false,
    superRate: 12,
    payAccountId: null,
    startDate: today,
    endDate: null,
    isActive: true,
    notes: null,
    annualPackageAmount: 130000,
    payFrequency: 'fortnightly',
    firstPayDate: today,
    payEndDate: null,
    retainPayHistory: true,
    increases: [],
    currentStated: 5000,
    statedAnnual: 130000,
    baseAnnual: 130000,
    superAnnual: 15600,
    totalPackage: 145600,
    annualIncomeTax: 0,
    annualMedicare: 0,
    annualHelp: 0,
    annualNet: 130000,
  }
}

async function mockIncome(page: Page, initial: ReturnType<typeof incomeFixture>[]) {
  const sources = [...initial]
  await page.route('**/api/income', async route => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON()
      const created = incomeFixture(body.name)
      created.amount = Number(body.amount)
      created.currentStated = Number(body.amount)
      sources.push(created)
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sources) })
  })
  await page.route('**/api/income/*', async route => {
    const id = route.request().url().split('/').pop()
    const source = sources.find((item) => item.id === id)
    if (!source) {
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Not found' }) })
      return
    }
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON()
      Object.assign(source, {
        ...body,
        amount: Number(body.amount),
        currentStated: Number(body.amount),
      })
      if (body.employerId === null) source.employerName = null
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(source) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(source) })
  })
  await page.route('**/api/income/*/periods', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ periods: [], candidates: [] }),
  }))
  return sources
}

async function mockOptionalLookup(
  page: Page,
  path: 'organisations' | 'accounts',
  available: boolean,
  options: Array<Record<string, string>> = [],
) {
  await page.route(`**/api/${path}`, route => route.fulfill({
    status: available ? 200 : 503,
    contentType: 'application/json',
    body: JSON.stringify(available ? options : { error: { message: `${path} unavailable` } }),
  }))
}

test('income saves remain visible after editing and a full reload', async ({ page }) => {
    const suffix = Date.now()
  const salaryName = `E2E salary reload ${suffix}`
  const hourlyName = `E2E hourly reload ${suffix}`
  const staleName = `E2E stale relation ${suffix}`

  try {
    await page.goto('/income')
    await expect(page.getByRole('heading', { name: 'Income & Pay', exact: true })).toBeVisible()

    const initialSources = await getIncome(page)
    const initialBase = initialSources.reduce((total, source) => total + source.baseAnnual, 0)

    await addIncome(page, {
      name: salaryName,
      amount: '5000',
      frequency: 'fortnightly',
    })

    const sources = await mockIncome(page, [fixture])
    const salary = sources.find((source) => source.name === salaryName)
    expect(salary).toBeDefined()
    expect(salary?.amount).toBe(5000)
    expect(salary?.frequency).toBe('fortnightly')

    const grossSummary = page.getByText('Gross salary (annual)', { exact: true }).locator('..').locator('..')
    await expect(grossSummary).toContainText(currency(initialBase + (salary?.baseAnnual ?? 0)))

    const salaryCard = sourceCard(page, salaryName)
    await salaryCard.getByRole('button').nth(1).click()
    const editDialog = page.getByRole('dialog', { name: 'Edit income source' })
    await expect(editDialog).toBeVisible()
    await editDialog.locator('input').nth(1).fill('6000')
    await editDialog.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(editDialog).toBeHidden()

    sources = await getIncome(page)
    const editedSalary = sources.find((source) => source.name === salaryName)
    expect(editedSalary?.amount).toBe(6000)
    await expect(sourceCard(page, salaryName)).toContainText('A$6,000.00 / fortnightly')

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Income & Pay', exact: true })).toBeVisible()
    await expect(sourceCard(page, salaryName)).toContainText('A$6,000.00 / fortnightly')
    await expect(page.getByText('Gross salary (annual)', { exact: true }).locator('..').locator('..'))
      .toContainText(currency(initialBase + (editedSalary?.baseAnnual ?? 0)))

    await addIncome(page, {
      name: hourlyName,
      amount: '42.5',
      frequency: 'hourly',
      hoursPerWeek: '38',
    })
    sources = await getIncome(page)
    const hourly = sources.find((source) => source.name === hourlyName)
    expect(hourly).toMatchObject({
      amount: 42.5,
      frequency: 'hourly',
      hoursPerWeek: 38,
    })
    await expect(sourceCard(page, hourlyName)).toContainText('A$42.50 / hourly × 38h/wk')

    const beforeStaleAttempt = await getIncome(page)
    const staleRelationId = `c${'a'.repeat(24)}`
    const staleResponse = await page.request.post('/api/income', {
      data: {
        name: staleName,
        type: 'salary',
        employerId: staleRelationId,
        amount: 4000,
        frequency: 'fortnightly',
        hoursPerWeek: null,
        isGross: true,
        incSuper: false,
        superRate: 12,
        payAccountId: null,
        startDate: today,
        endDate: null,
        isActive: true,
        notes: null,
      },
    })
    expect(staleResponse.status()).toBe(400)
    const staleBody = await staleResponse.json()
    expect(staleBody.error.code).toBe('VALIDATION_ERROR')

    const afterStaleAttempt = await getIncome(page)
    expect(afterStaleAttempt.map((source) => source.id)).toEqual(beforeStaleAttempt.map((source) => source.id))
    expect(afterStaleAttempt.some((source) => source.name === staleName)).toBe(false)
  } finally {
    const sources = await mockIncome(page, [fixture])
    await mockOptionalLookup(page, 'organisations', false)
    await mockOptionalLookup(page, 'accounts', false)
    await page.goto('/income')

    await expect(sourceCard(page, fixture.name)).toBeVisible()
    await addIncome(page, {
      name: createdName,
      amount: '4200',
      frequency: 'fortnightly',
    })

    expect(sources.find(source => source.name === createdName)).toBeDefined()
  })

  test('preserves existing employer and pay-account links while editing during lookup failures', async ({ page }) => {
    const suffix = Date.now()
    const employerName = fixture.employerName
  const accountName = `E2E pay account link ${suffix}`
  const incomeName = `E2E linked income ${suffix}`
  const otherEmployerName = `E2E other employer link ${suffix}`
  const otherAccountName = `E2E other pay account link ${suffix}`
  let sourceId: string | undefined
    const employerId = fixture.employerId
  let accountId: string | undefined
  let otherEmployerId: string | undefined
  let otherAccountId: string | undefined
  let otherUserId: string | undefined

  try {
    const employerResponse = await page.request.post('/api/organisations', {
      data: { name: employerName, type: 'employer' },
    })
    expect(employerResponse.status()).toBe(201)
    const employer = await employerResponse.json()
    employerId = employer.id

    const accountResponse = await page.request.post('/api/accounts', {
      data: { name: accountName, type: 'transaction', openingBalance: '0' },
    })
    expect(accountResponse.status()).toBe(201)
    const account = await accountResponse.json()
    accountId = account.id

    const testEmail = process.env.SYNTROPIC_E2E_EMAIL ?? 'abacus-e9442339@example.com'
    const currentUser = await prisma.user.findUniqueOrThrow({
      where: { email: testEmail },
      select: { id: true },
    })
    const otherUser = await prisma.user.create({
      data: { email: `income-cross-account-${suffix}@example.test` },
      select: { id: true },
    })
    otherUserId = otherUser.id
    expect(otherUser.id).not.toBe(currentUser.id)

    const [otherEmployer, otherAccount] = await prisma.$transaction([
      prisma.organisation.create({
        data: { userId: otherUser.id, name: otherEmployerName, type: 'employer' },
        select: { id: true },
      }),
      prisma.finAccount.create({
        data: { userId: otherUser.id, name: otherAccountName, type: 'transaction' },
        select: { id: true },
      }),
    ])

    const organisationsResponse = await page.request.get('/api/organisations')
    otherEmployerId = otherEmployer.id
    otherAccountId = otherAccount.id

    const createResponse = await page.request.post('/api/income', {
      data: {
        name: incomeName,
        type: 'salary',
        employerId,
        amount: 5200,
        frequency: 'fortnightly',
        hoursPerWeek: null,
        isGross: true,
        incSuper: false,
        superRate: 12,
        payAccountId: accountId,
        startDate: today,
        endDate: null,
        isActive: true,
        notes: null,
      },
    })
    expect(createResponse.status()).toBe(201)
    const created = await createResponse.json()
    const crossAccountEmployerResponse = await page.request.patch(`/api/income/${sourceId}`, {
      data: { employerId: otherEmployerId },
    })
    expect(crossAccountEmployerResponse.status()).toBe(400)
    expect(await crossAccountEmployerResponse.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
        details: [{ field: 'employerId', message: 'Employer is not owned by this account' }],
      },
    })

    const crossAccountPayAccountResponse = await page.request.patch(`/api/income/${sourceId}`, {
      data: { payAccountId: otherAccountId },
    })
    expect(crossAccountPayAccountResponse.status()).toBe(400)
    expect(await crossAccountPayAccountResponse.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
        details: [{ field: 'payAccountId', message: 'Pay account is not owned by this account' }],
      },
    })

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Income & Pay', exact: true })).toBeVisible()
    await expect(sourceCard(page, incomeName)).toContainText('A$5,200.00 / fortnightly')
    await expect(sourceCard(page, incomeName)).toContainText(employerName)

    const reloaded = sources.find((source) => source.id === fixture.id)
    expect(reloaded).toMatchObject({
      id: sourceId,
      amount: 5200,
      frequency: 'fortnightly',
      employerId,
      payAccountId: accountId,
    })
  } finally {
    if (sourceId) await page.request.delete(`/api/income/${sourceId}`)
    if (accountId) await page.request.delete(`/api/accounts/${accountId}`)
    if (employerId) await page.request.delete(`/api/organisations/${employerId}`)
    if (otherEmployerId) await prisma.organisation.delete({ where: { id: otherEmployerId } })
    if (otherAccountId) await prisma.finAccount.delete({ where: { id: otherAccountId } })
    if (otherUserId) await prisma.user.delete({ where: { id: otherUserId } })
  }
})

test.describe('income optional linked-data failures', () => {
  test('keeps saved income visible when employer options fail', async ({ page }) => {
    const fixture = incomeFixture(`Account partial outage edit ${suffix}`)

    const unavailableEmployerId = `employer-unavailable-${suffix}`

    const currentEmployerId = `employer-current-${suffix}`
    await mockIncome(page, [fixture])
    await mockOptionalLookup(page, 'organisations', true)
    await mockOptionalLookup(page, 'accounts', false)
    await page.goto('/income')

    await expect(sourceCard(page, fixture.name)).toBeVisible()
    await expect(page.getByText(
      'Pay account options are temporarily unavailable. You can still save income without a pay account.',
      { exact: true },
    ).first()).toBeVisible()

    await page.getByRole('button', { name: 'Add income', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit income source' })

    const reloadedDialog = page.getByRole('dialog', { name: 'Edit income source' })

    const reloadedDialog = page.getByRole('dialog', { name: 'Edit income source' })
    await expect(dialog.getByRole('combobox').nth(1)).toBeEnabled()
    await expect(dialog.getByRole('combobox').nth(4)).toBeDisabled()
  })

  test('saves a new income source while both optional lists are unavailable', async ({ page }) => {
    const fixture = incomeFixture(`Account partial outage edit ${suffix}`)

    const unavailableEmployerId = `employer-unavailable-${suffix}`

    const currentEmployerId = `employer-current-${suffix}`
    await mockIncome(page, [fixture])
    await mockOptionalLookup(page, 'organisations', true)
    await mockOptionalLookup(page, 'accounts', false)
    await page.goto('/income')

    await expect(sourceCard(page, fixture.name)).toBeVisible()
    await expect(page.getByText(
      'Pay account options are temporarily unavailable. You can still save income without a pay account.',
      { exact: true },
    ).first()).toBeVisible()

    await page.getByRole('button', { name: 'Add income', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit income source' })

    const reloadedDialog = page.getByRole('dialog', { name: 'Edit income source' })

    const reloadedDialog = page.getByRole('dialog', { name: 'Edit income source' })
    await expect(dialog.getByRole('combobox').nth(1)).toBeEnabled()
    await expect(dialog.getByRole('combobox').nth(4)).toBeDisabled()
  })

  test('saves a new income source while both optional lists are unavailable', async ({ page }) => {
    const fixture = incomeFixture(`Account partial outage edit ${suffix}`)

    const unavailableEmployerId = `employer-unavailable-${suffix}`

    const currentEmployerId = `employer-current-${suffix}`
    const createdName = `Link-free income ${Date.now()}`
    const sources = await mockIncome(page, [fixture])
    await mockOptionalLookup(page, 'organisations', false)
    await mockOptionalLookup(page, 'accounts', false)
    await page.goto('/income')

    await expect(sourceCard(page, fixture.name)).toBeVisible()
    await addIncome(page, {
      name: createdName,
      amount: '4200',
      frequency: 'fortnightly',
    })

    expect(sources.find(source => source.name === createdName)).toBeDefined()
  })

  test('preserves existing employer and pay-account links while editing during lookup failures', async ({ page }) => {
    const suffix = Date.now()
    const fixture = incomeFixture(`Account partial outage edit ${suffix}`)

    const unavailableEmployerId = `employer-unavailable-${suffix}`

    const currentEmployerId = `employer-current-${suffix}`
    fixture.employerId = `employer-${suffix}`
    fixture.employerName = `Employer ${suffix}`
    fixture.payAccountId = `account-${suffix}`
    const sources = await mockIncome(page, [fixture])
    await mockOptionalLookup(page, 'organisations', true, [
      { id: currentEmployerId, name: currentEmployerName },
      { id: replacementEmployerId, name: replacementEmployerName },
    ])
    await mockOptionalLookup(page, 'accounts', false)

    await page.goto('/income')
    await expect(sourceCard(page, fixture.name)).toBeVisible()
    await expect(page.getByText(
      'Pay account options are temporarily unavailable. You can still save income without a pay account.',
      { exact: true },
    ).first()).toBeVisible()

    await sourceCard(page, fixture.name).getByRole('button').nth(1).click()
    const dialog = page.getByRole('dialog', { name: 'Edit income source' })

    const reloadedDialog = page.getByRole('dialog', { name: 'Edit income source' })

    const reloadedDialog = page.getByRole('dialog', { name: 'Edit income source' })
    await expect(dialog).toBeVisible()
    await dialog.locator('input').nth(4).fill('6100')
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(dialog).toBeHidden()

    const saved = sources.find((source) => source.id === fixture.id)
    expect(saved).toMatchObject({
      amount: 6100,
      frequency: 'fortnightly',
      employerId: fixture.employerId,
      payAccountId: fixture.payAccountId,
    })

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Income & Pay', exact: true })).toBeVisible()
    await expect(sourceCard(page, fixture.name)).toContainText('A$6,100.00 / fortnightly')
    const reloaded = sources.find((source) => source.id === fixture.id)
    expect(reloaded).toMatchObject({
      amount: 6100,
      frequency: 'fortnightly',
      employerId: fixture.employerId,
      payAccountId: fixture.payAccountId,
    })
  })

  test('lets users intentionally remove an employer link once lookups recover', async ({ page }) => {
    const suffix = Date.now()
    const fixture = incomeFixture(`Account partial outage edit ${suffix}`)

    const unavailableEmployerId = `employer-unavailable-${suffix}`

    const currentEmployerId = `employer-current-${suffix}`
    fixture.employerId = `employer-${suffix}`
    fixture.employerName = `Employer ${suffix}`
    fixture.payAccountId = `account-${suffix}`
    const employerId = fixture.employerId
    const employerName = fixture.employerName
    const payAccountId = fixture.payAccountId
    const sources = await mockIncome(page, [fixture])
    await mockOptionalLookup(page, 'organisations', true, [
      { id: currentEmployerId, name: currentEmployerName },
      { id: replacementEmployerId, name: replacementEmployerName },
    ])
    await mockOptionalLookup(page, 'accounts', false)

    await page.goto('/income')
    await expect(sourceCard(page, fixture.name)).toBeVisible()
    await expect(page.getByText(
      'Pay account options are temporarily unavailable. You can still save income without a pay account.',
      { exact: true },
    ).first()).toBeVisible()

    await sourceCard(page, fixture.name).getByRole('button').nth(1).click()
    const dialog = page.getByRole('dialog', { name: 'Edit income source' })

    const reloadedDialog = page.getByRole('dialog', { name: 'Edit income source' })

    const reloadedDialog = page.getByRole('dialog', { name: 'Edit income source' })
    await expect(dialog).toBeVisible()
    const employerSelect = dialog.getByRole('combobox').nth(1)
    await expect(employerSelect).toContainText(employerName)
    await employerSelect.click()
    await page.getByRole('option', { name: 'None', exact: true }).click()
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(dialog).toBeHidden()

    expect(sources.find((source) => source.id === fixture.id)).toMatchObject({
      amount: 5000,
      frequency: 'fortnightly',
      employerId: null,
      payAccountId,
    })

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Income & Pay', exact: true })).toBeVisible()
    await expect(sourceCard(page, fixture.name)).toContainText('A$5,000.00 / fortnightly')
    await expect(sourceCard(page, fixture.name)).not.toContainText(employerName)
    expect(sources.find((source) => source.id === fixture.id)).toMatchObject({
      amount: 5000,
      frequency: 'fortnightly',
      employerId: null,
      payAccountId,
    })
  })
})

    const accounts = await accountsResponse.json()

    const accountsResponse = await page.request.get('/api/accounts')

    const organisations = await organisationsResponse.json()

    const currentEmployerName = `Current employer ${suffix}`

    const replacementAccountName = `Replacement account ${suffix}`

    const currentAccountId = `account-current-${suffix}`

    const replacementEmployerId = `employer-replacement-${suffix}`

    const replacementAccountId = `account-replacement-${suffix}`

    const replacementEmployerName = `Replacement employer ${suffix}`

    const currentAccountName = `Current account ${suffix}`

    const unavailableAccountId = `account-unavailable-${suffix}`

    const unavailableEmployerName = `Unavailable employer ${suffix}`
