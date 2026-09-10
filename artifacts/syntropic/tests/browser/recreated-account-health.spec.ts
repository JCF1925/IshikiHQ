import { expect, test } from '@playwright/test'
import { prisma } from '../../lib/db'

const password = 'Recreated!Health2026'
const oldClaim = 'Deleted account Medicare marker'
const oldPolicy = 'Deleted account private policy'
const oldImport = 'deleted-account-claims.csv'
let email = ''
let googleEmail = ''
const fixtureUserIds = new Set<string>()

test.beforeAll(() => {
  const schema = new URL(process.env.DATABASE_URL ?? '').searchParams.get('schema')
  if (
    process.env.RECREATED_ACCOUNT_ACCEPTANCE !== '1'
    || !schema?.startsWith('acceptance_')
    || schema !== process.env.RECREATED_ACCOUNT_ACCEPTANCE_SCHEMA
  ) {
    throw new Error('Recreated-account browser acceptance requires its disposable acceptance schema')
  }
  email = `recreated-health-${schema}@example.test`
  googleEmail = `recreated-google-health-${schema}@example.test`
})

async function createAccount(
  page: import('@playwright/test').Page,
  accountEmail: string,
  name: string,
) {
  await page.goto('/signup')
  await page.evaluate(async () => {
    await fetch('/api/auth/csrf', { credentials: 'same-origin' })
  })
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Email').fill(accountEmail)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page).toHaveURL(/\/(?:\?.*)?$/)
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
}

test.afterAll(async () => {
  if (fixtureUserIds.size > 0) {
    const userIds = [...fixtureUserIds]
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.health_claim_account_deletion', 'on', true)`
      await tx.healthClaimImportAudit.updateMany({
        where: {
          OR: [
            { userId: { in: userIds } },
            { actorUserId: { in: userIds } },
            { import: { userId: { in: userIds } } },
          ],
        },
        data: { userId: null, actorUserId: null },
      })
      await tx.healthClaimImport.updateMany({
        where: { userId: { in: userIds } },
        data: {
          userId: null,
          deletedAt: new Date(),
          fileName: '[deleted]',
          sha256: '[deleted]',
          storageKey: '[deleted]',
        },
      })
      await tx.user.deleteMany({ where: { id: { in: userIds } } })
    })
  }
  await prisma.$disconnect()
})

test('a recreated account sees no health records or audit history from the deleted account', async ({ page }) => {
  await createAccount(page, email, 'Original health owner')

  const original = await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } })
  fixtureUserIds.add(original.id)
  await prisma.$transaction([
    prisma.medicareClaim.create({
      data: {
        userId: original.id,
        serviceDate: new Date(),
        description: oldClaim,
        provider: 'Deleted account clinic',
        feeCharged: 120,
        benefitPaid: 70,
        outOfPocket: 50,
      },
    }),
    prisma.phiPolicy.create({
      data: {
        userId: original.id,
        policyName: oldPolicy,
        policyNumber: 'DELETED-POLICY-001',
        coverType: 'combined',
      },
    }),
    prisma.healthClaimImport.create({
      data: {
        userId: original.id,
        kind: 'medicare',
        fileName: oldImport,
        contentType: 'text/csv',
        byteSize: 64,
        sha256: '9'.repeat(64),
        storageKey: `private/${original.id}/health-claims/${oldImport}`,
        status: 'review',
        auditEvents: {
          create: {
            userId: original.id,
            actorUserId: original.id,
            action: 'source_uploaded',
          },
        },
      },
    }),
  ])
  await page.goto('/health-funding')
  await expect(page.getByRole('heading', { name: 'Health Funding' })).toBeVisible()
  await expect(page.getByText(oldClaim, { exact: true })).toBeVisible()
  await expect(page.getByText(oldImport, { exact: false })).toBeVisible()
  await page.getByRole('tab', { name: 'Private Health' }).click()
  await expect(page.getByText(oldPolicy, { exact: true })).toBeVisible()

  // The API-level acceptance test owns the private-object cleanup assertion. Detach the
  // import here so this browser check stays independent of external object storage while
  // retaining the same tombstone that a successful account deletion leaves behind.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.health_claim_account_deletion', 'on', true)`
    await tx.healthClaimImportAudit.updateMany({
      where: { import: { userId: original.id } },
      data: { userId: null, actorUserId: null },
    })
    await tx.healthClaimImport.updateMany({
      where: { userId: original.id },
      data: {
        userId: null,
        deletedAt: new Date(),
        fileName: '[deleted]',
        sha256: '[deleted]',
        storageKey: '[deleted]',
      },
    })
  })

  await page.goto('/settings')
  await page.getByLabel('Type DELETE MY ACCOUNT to confirm').fill('DELETE MY ACCOUNT')
  await page.getByRole('button', { name: 'Permanently delete account' }).click()
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/)

  await createAccount(page, email, 'Replacement health owner')
  const replacement = await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } })
  fixtureUserIds.add(replacement.id)
  expect(replacement.id).not.toBe(original.id)

  await page.goto('/health-funding')
  await expect(page.getByRole('heading', { name: 'Health Funding' })).toBeVisible()
  await expect(page.getByText(`No claims recorded for ${new Date().getFullYear()}.`, { exact: true })).toBeVisible()
  await expect(page.getByText('Claim import history', { exact: true })).toHaveCount(0)
  await expect(page.getByText(oldClaim, { exact: true })).toHaveCount(0)
  await expect(page.getByText(oldImport, { exact: false })).toHaveCount(0)
  await expect(page.getByText('Private audit history', { exact: true })).toHaveCount(0)

  await page.getByRole('tab', { name: 'Private Health' }).click()
  await expect(page.getByText('No private health policies recorded.', { exact: true })).toBeVisible()
  await expect(page.getByText(oldPolicy, { exact: true })).toHaveCount(0)
})

test('a Google-recreated account sees no health records or import history from the deleted account', async ({ page }) => {
  test.skip(
    process.env.GOOGLE_OAUTH_FIXTURE !== '1'
      || !process.env.GOOGLE_OAUTH_FIXTURE_EMAIL,
    'Google recreation acceptance requires the controlled OAuth fixture',
  )

  await createAccount(page, googleEmail, 'Original Google health owner')

  const original = await prisma.user.findUniqueOrThrow({
    where: { email: googleEmail },
    select: { id: true },
  })
  fixtureUserIds.add(original.id)
  await prisma.$transaction([
    prisma.medicareClaim.create({
      data: {
        userId: original.id,
        serviceDate: new Date(),
        description: oldClaim,
        provider: 'Deleted Google account clinic',
        feeCharged: 180,
        benefitPaid: 95,
        outOfPocket: 85,
      },
    }),
    prisma.phiPolicy.create({
      data: {
        userId: original.id,
        policyName: oldPolicy,
        policyNumber: 'DELETED-GOOGLE-POLICY-001',
        coverType: 'hospital',
      },
    }),
    prisma.healthClaimImport.create({
      data: {
        userId: original.id,
        kind: 'private_health',
        fileName: oldImport,
        contentType: 'text/csv',
        byteSize: 64,
        sha256: '8'.repeat(64),
        storageKey: `private/${original.id}/health-claims/${oldImport}`,
        status: 'review',
        auditEvents: {
          create: {
            userId: original.id,
            actorUserId: original.id,
            action: 'source_uploaded',
          },
        },
      },
    }),
  ])
  await page.goto('/health-funding')
  await expect(page.getByRole('heading', { name: 'Health Funding' })).toBeVisible()
  await expect(page.getByText(oldClaim, { exact: true })).toBeVisible()
  await expect(page.getByText(oldImport, { exact: false })).toBeVisible()
  await page.getByRole('tab', { name: 'Private Health' }).click()
  await expect(page.getByText(oldPolicy, { exact: true })).toBeVisible()

  // Keep this browser check independent of external object storage while leaving the
  // ownership-detached import tombstone that account deletion creates.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.health_claim_account_deletion', 'on', true)`
    await tx.healthClaimImportAudit.updateMany({
      where: { import: { userId: original.id } },
      data: { userId: null, actorUserId: null },
    })
    await tx.healthClaimImport.updateMany({
      where: { userId: original.id },
      data: {
        userId: null,
        deletedAt: new Date(),
        fileName: '[deleted]',
        sha256: '[deleted]',
        storageKey: '[deleted]',
      },
    })
  })

  await page.goto('/settings')
  await page.getByLabel('Type DELETE MY ACCOUNT to confirm').fill('DELETE MY ACCOUNT')
  await page.getByRole('button', { name: 'Permanently delete account' }).click()
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/)

  await page.goto('/login')
  await page.getByRole('button', { name: 'Continue with Google', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()

  const replacement = await prisma.user.findUniqueOrThrow({
    where: { email: googleEmail },
    select: { id: true },
  })
  fixtureUserIds.add(replacement.id)
  expect(replacement.id).not.toBe(original.id)

  await page.goto('/health-funding')
  await expect(page.getByRole('heading', { name: 'Health Funding' })).toBeVisible()
  await expect(page.getByText(`No claims recorded for ${new Date().getFullYear()}.`, { exact: true })).toBeVisible()
  await expect(page.getByText('Claim import history', { exact: true })).toHaveCount(0)
  await expect(page.getByText(oldClaim, { exact: true })).toHaveCount(0)
  await expect(page.getByText(oldImport, { exact: false })).toHaveCount(0)
  await expect(page.getByText('Private audit history', { exact: true })).toHaveCount(0)

  await page.getByRole('tab', { name: 'Private Health' }).click()
  await expect(page.getByText('No private health policies recorded.', { exact: true })).toBeVisible()
  await expect(page.getByText(oldPolicy, { exact: true })).toHaveCount(0)
})