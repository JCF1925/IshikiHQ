import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { describe, it } from 'node:test'
import {
  deterministicTestFiles,
  environmentDependencyFor,
} from '../scripts/test-suite-routing.mjs'
import { checkFeatureInventory } from '../scripts/check-feature-inventory.mjs'

describe('test suite routing', () => {
  it('keeps the feature inventory valid and synchronized with visible web navigation', async () => {
    const [inventoryText, sidebarSource] = await Promise.all([
      readFile('docs/ishiki-module-feature-inventory.csv', 'utf8'),
      readFile('components/app-sidebar.tsx', 'utf8'),
    ])
    const result = checkFeatureInventory({ inventoryText, sidebarSource })

    assert.deepEqual(result.errors, [])
    assert.deepEqual(result.missingRoutes, [])
    assert.deepEqual(result.staleRoutes, [])
  })

  it('reports malformed inventory rows and route drift without reading user data', () => {
    const result = checkFeatureInventory({
      inventoryText: [
        'Wrong,Header',
        'Module,Submodule,Feature/Function,Web,/missing',
      ].join('\n'),
      sidebarSource: `const links = [{ href: '/current' }]`,
    })

    assert.match(result.message, /CSV header must be/)
    assert.match(result.message, /CSV row 2 must contain exactly 6 columns/)
    assert.deepEqual(result.missingRoutes, ['/current'])
    assert.deepEqual(result.staleRoutes, [])
  })

  it('reports inventory routes that no longer have visible navigation', () => {
    const result = checkFeatureInventory({
      inventoryText: [
        '"Module","Submodule","Feature/Function","Surface","Route or Source","Notes"',
        '"Dashboard","Overview","Current","Web","/current",""',
        '"Legacy","Overview","Removed","Web","/legacy",""',
      ].join('\n'),
      sidebarSource: `const links = [{ href: '/current' }]`,
    })

    assert.deepEqual(result.missingRoutes, [])
    assert.deepEqual(result.staleRoutes, ['/legacy'])
    assert.match(result.message, /Stale routes: \/legacy/)
  })

  it('keeps staging and database acceptance files out of routine tests', async () => {
    const allTests = (await readdir('tests')).filter((fileName) => fileName.endsWith('.test.ts'))
    const selected = deterministicTestFiles(await readdir('tests'))

    assert.equal(environmentDependencyFor('google-auth-staging.test.ts'), 'staging')
    assert.equal(environmentDependencyFor('household-db.test.ts'), 'database')
    assert.equal(environmentDependencyFor('interpersonal-debt-db.test.ts'), 'database')
    assert.equal(environmentDependencyFor('medication-stock-db.test.ts'), 'database')
    assert.equal(environmentDependencyFor('pharmacy-refill-db.test.ts'), 'database')
    assert.equal(environmentDependencyFor('referral-usage-database.test.ts'), 'database')
    assert.equal(environmentDependencyFor('calendar-worker.test.ts'), 'database')
    assert.equal(environmentDependencyFor('appointment-care-db.test.ts'), 'database')

    for (const environmentDependent of [
      'google-auth-staging.test.ts',
      'household-db.test.ts',
      'interpersonal-debt-db.test.ts',
      'medication-stock-db.test.ts',
      'pharmacy-refill-db.test.ts',
      'referral-usage-database.test.ts',
      'calendar-worker.test.ts',
      'appointment-care-db.test.ts',
    ]) {
      assert.ok(allTests.includes(environmentDependent), `${environmentDependent} should remain available`)
      assert.ok(!selected.includes(environmentDependent), `${environmentDependent} must not run routinely`)
    }
  })

  it('rejects an unclassified direct Prisma client from the deterministic lane', async () => {
    const selected = deterministicTestFiles(await readdir('tests'))
    const directDatabaseFixtures: string[] = []

    for (const fileName of selected) {
      const source = await readFile(`tests/${fileName}`, 'utf8')
      if (/\bnew\s+PrismaClient\s*\(/.test(source)) directDatabaseFixtures.push(fileName)
    }

    assert.deepEqual(
      directDatabaseFixtures,
      [],
      'Direct Prisma acceptance fixtures must be classified outside the deterministic lane',
    )
  })

  it('preserves explicit staging and disposable-database commands', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      scripts: Record<string, string>
    }
    const stagingScript = await readFile('scripts/run-google-auth-regression.sh', 'utf8')
    const databaseScript = await readFile('scripts/clean-database-acceptance.sh', 'utf8')
    assert.equal(packageJson.scripts.test, 'node scripts/run-deterministic-tests.mjs')
    assert.equal(
      packageJson.scripts['test:acceptance-interruption:preflight'],
      'bash scripts/test-database-acceptance-interruption-preflight.sh',
    )
    assert.equal(
      packageJson.scripts['test:acceptance-interruption:database'],
      'pnpm run test:acceptance-interruption:preflight && bash scripts/test-clean-database-acceptance-interruption.sh',
    )
    assert.equal(
      packageJson.scripts['test:price-watch:database'],
      'DATABASE_ACCEPTANCE_FOCUS=price-watches bash scripts/clean-database-acceptance.sh',
    )
    assert.equal(
      packageJson.scripts['test:storage-labels:database'],
      'DATABASE_ACCEPTANCE_FOCUS=storage-labels bash scripts/clean-database-acceptance.sh',
    )
    assert.match(packageJson.scripts['test:auth-google:staging'], /run-google-auth-regression\.sh staging/)
    assert.match(stagingScript, /tests\/google-auth-staging\.test\.ts/)
    assert.match(databaseScript, /tests\/calendar-worker\.test\.ts/)
    assert.match(databaseScript, /PAY_REVIEW_DATABASE_TESTS=1/)
    assert.match(databaseScript, /tests\/work\.test\.ts/)
    assert.match(databaseScript, /HEALTH_CLAIM_DATABASE_TESTS=1/)
    assert.match(databaseScript, /tests\/health-claims-import\.test\.ts/)
    assert.match(databaseScript, /HEALTH_FUNDING_SUMMARY_DATABASE_TESTS=1/)
    assert.match(databaseScript, /tests\/health-funding-summary\.test\.ts/)
    assert.match(databaseScript, /PRICE_WATCH_DATABASE_TESTS=1/)
    assert.match(databaseScript, /tests\/price-watch-database\.test\.ts/)
    assert.match(databaseScript, /STORAGE_LABEL_DATABASE_TESTS=1/)
    assert.match(databaseScript, /tests\/storage-labels-database\.test\.ts/)
    assert.match(databaseScript, /INTERPERSONAL_DEBT_DATABASE_TESTS=1/)
    assert.match(databaseScript, /tests\/interpersonal-debt-db\.test\.ts/)
    assert.match(databaseScript, /PHARMACY_REFILL_DATABASE_TESTS=1/)
    assert.match(databaseScript, /tests\/pharmacy-refill-db\.test\.ts/)
    assert.match(databaseScript, /REFERRAL_DATABASE_TESTS=1/)
    assert.match(databaseScript, /tests\/referral-usage-database\.test\.ts/)
    assert.equal(
      packageJson.scripts['test:appointment-care:database'],
      'DATABASE_ACCEPTANCE_FOCUS=appointment-care bash scripts/clean-database-acceptance.sh',
    )
    assert.match(databaseScript, /APPOINTMENT_CARE_DATABASE_TESTS=1/)
    assert.match(databaseScript, /tests\/appointment-care-db\.test\.ts/)
  })
})
