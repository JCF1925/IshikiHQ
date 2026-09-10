import { spawnSync } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'

const cleanFixture = [
  'export const lintReleaseContractFixture = true',
  '',
].join('\n')
const warningFixture = [
  '/* eslint no-warning-comments: "warn" */',
  '// TODO: deliberate warning used by the lint release-contract regression',
  'export const lintReleaseContractFixture = true',
  '',
].join('\n')

const generatedFixtures = [
  'playwright-report/lint-release-contract.fixture.js',
  'test-results/lint-release-contract.fixture.js',
]
const sourceFixture = 'lint-release-contract.fixture.js'

function runLint(label, fixtures) {
  console.log(`lint release contract: ${label}`)
  const result = spawnSync('pnpm', [
    'exec',
    'eslint',
    ...fixtures,
    '--max-warnings=0',
    '--no-warn-ignored',
  ], {
    encoding: 'utf8',
    env: process.env,
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  process.stdout.write(output)

  if (result.error) {
    throw new Error(`Could not start the Syntropic lint command: ${result.error.message}`)
  }

  return { output, status: result.status ?? 1 }
}

try {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  if (packageJson.scripts?.lint !== 'eslint . --max-warnings=0') {
    throw new Error('The Syntropic lint command must enforce eslint . --max-warnings=0')
  }

  for (const fixture of generatedFixtures) {
    await mkdir(new URL(`../${fixture.substring(0, fixture.lastIndexOf('/'))}/`, import.meta.url), {
      recursive: true,
    })
    await writeFile(new URL(`../${fixture}`, import.meta.url), warningFixture)
  }

  await writeFile(new URL(`../${sourceFixture}`, import.meta.url), cleanFixture)
  const cleanRun = runLint(
    'expecting a clean run with generated Playwright output excluded',
    [sourceFixture, ...generatedFixtures],
  )
  if (cleanRun.status !== 0) {
    throw new Error(`Expected the clean lint command to pass, but it exited ${cleanRun.status}`)
  }

  await writeFile(new URL(`../${sourceFixture}`, import.meta.url), warningFixture)
  const warningRun = runLint(
    'expecting a source warning to fail the zero-warning policy',
    [sourceFixture],
  )

  if (warningRun.status === 0) {
    throw new Error('Expected a deliberately introduced source warning to fail lint')
  }
  if (!warningRun.output.includes('no-warning-comments') || !warningRun.output.includes('warning')) {
    throw new Error('The failing lint output did not visibly identify the deliberate warning')
  }
  if (!warningRun.output.includes('ESLint found too many warnings')) {
    throw new Error('The failing lint output did not identify the enforced zero-warning policy')
  }

  console.log('lint release contract: clean and deliberate-warning checks passed')
} finally {
  await Promise.all([
    ...generatedFixtures.map((fixture) => rm(new URL(`../${fixture}`, import.meta.url), { force: true })),
    rm(new URL(`../${sourceFixture}`, import.meta.url), { force: true }),
  ])
}