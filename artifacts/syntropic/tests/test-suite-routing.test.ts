import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { describe, it } from 'node:test'
import {
  deterministicTestFiles,
  environmentDependencyFor,
} from '../scripts/test-suite-routing.mjs'

describe('test suite routing', () => {
  it('keeps staging and database acceptance files out of routine tests', async () => {
    const allTests = (await readdir('tests')).filter((fileName) => fileName.endsWith('.test.ts'))
    const selected = deterministicTestFiles(allTests)

    assert.equal(environmentDependencyFor('google-auth-staging.test.ts'), 'staging')
    assert.equal(environmentDependencyFor('household-db.test.ts'), 'database')
    assert.equal(environmentDependencyFor('medication-stock-db.test.ts'), 'database')
    assert.equal(environmentDependencyFor('calendar-worker.test.ts'), 'database')

    for (const environmentDependent of [
      'google-auth-staging.test.ts',
      'household-db.test.ts',
      'medication-stock-db.test.ts',
      'calendar-worker.test.ts',
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
      packageJson.scripts['test:acceptance-interruption:database'],
      'bash scripts/test-clean-database-acceptance-interruption.sh',
    )
    assert.equal(
      packageJson.scripts['test:price-watch:database'],
      'DATABASE_ACCEPTANCE_FOCUS=price-watches bash scripts/clean-database-acceptance.sh',
    )
    assert.match(packageJson.scripts['test:auth-google:staging'], /run-google-auth-regression\.sh staging/)
    assert.match(stagingScript, /tests\/google-auth-staging\.test\.ts/)
    assert.match(databaseScript, /tests\/calendar-worker\.test\.ts/)
    assert.match(databaseScript, /PAY_REVIEW_DATABASE_TESTS=1/)
    assert.match(databaseScript, /tests\/work\.test\.ts/)
    assert.match(databaseScript, /HEALTH_CLAIM_DATABASE_TESTS=1/)
    assert.match(databaseScript, /tests\/health-claims-import\.test\.ts/)
    assert.match(databaseScript, /PRICE_WATCH_DATABASE_TESTS=1/)
    assert.match(databaseScript, /tests\/price-watch-database\.test\.ts/)
  })
})