import { expect, test } from '@playwright/test'
import { prisma } from '../../lib/db'

const password = 'Signup!Acceptance2026'
const callbackUrl = '/events?from=signup#protected-destination'
let email = ''

test.beforeAll(() => {
  const databaseUrl = process.env.DATABASE_URL
  const schema = databaseUrl ? new URL(databaseUrl).searchParams.get('schema') : null
  if (
    process.env.SIGNUP_DESTINATION_ACCEPTANCE !== '1'
    || !schema?.startsWith('acceptance_')
    || schema !== process.env.SIGNUP_DESTINATION_ACCEPTANCE_SCHEMA
  ) {
    throw new Error('Signup destination acceptance requires its disposable acceptance schema')
  }
  email = `signup-destination-${schema}@example.test`
})

test.afterAll(async () => {
  if (email) {
    await prisma.user.deleteMany({ where: { email } })
  }
  await prisma.$disconnect()
})

test('a new account reaches the protected callback destination with a session', async ({ page }) => {
  await page.goto(`/signup?callbackUrl=${encodeURIComponent(callbackUrl)}`)
  await page.getByLabel('Name').fill('Signup acceptance owner')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Create account', exact: true }).click()

  await expect(page).toHaveURL(new RegExp(`${callbackUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`))
  await expect(page.getByRole('heading', { name: 'Events & Calendar', exact: true })).toBeVisible()

  const sessionCookies = (await page.context().cookies()).filter(({ name }) => (
    name === 'authjs.session-token' || name === '__Secure-authjs.session-token'
  ))
  expect(sessionCookies).not.toHaveLength(0)

  const user = await prisma.user.findUnique({
    where: { email },
    select: { name: true, passwordHash: true },
  })
  expect(user).toEqual({
    name: 'Signup acceptance owner',
    passwordHash: expect.any(String),
  })
})