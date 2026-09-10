import { readdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { deterministicTestFiles } from './test-suite-routing.mjs'

const tests = deterministicTestFiles(await readdir('tests'))
if (tests.length === 0) {
  console.error('deterministic tests: no test files selected')
  process.exit(1)
}

const result = spawnSync(
  'pnpm',
  [
    'exec',
    'tsx',
    '--test',
    '--experimental-test-module-mocks',
    ...tests.map((fileName) => `tests/${fileName}`),
  ],
  { stdio: 'inherit' },
)

if (result.error) {
  console.error(`deterministic tests: failed to start: ${result.error.message}`)
  process.exit(1)
}
process.exit(result.status ?? 1)