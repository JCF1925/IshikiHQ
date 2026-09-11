import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

const appDir = fileURLToPath(new URL('../', import.meta.url))
const nextDir = path.join(appDir, '.next')
const tsconfigPath = path.join(appDir, 'tsconfig.json')
const nextEnvPath = path.join(appDir, 'next-env.d.ts')
const devValidator = path.join(nextDir, 'dev', 'types', 'validator.ts')
const sourceFixture = path.join(appDir, 'typecheck-release-contract.fixture.ts')
const malformedValidator = 'const malformedNextDevelopmentValidator = ;\n'
const deliberateSourceError = [
  'const deliberateTypecheckError: string = 123',
  'export { deliberateTypecheckError }',
  '',
].join('\n')

function runTypecheck(label) {
  console.log(`typecheck release contract: ${label}`)
  const result = spawnSync('pnpm', ['run', 'typecheck'], {
    cwd: appDir,
    encoding: 'utf8',
    env: { ...process.env, NEXT_DIST_DIR: '.next' },
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  process.stdout.write(output)

  if (result.error) {
    throw new Error(`Could not start the Syntropic typecheck command: ${result.error.message}`)
  }

  return { output, status: result.status ?? 1 }
}

function runTsc(label) {
  console.log(`typecheck release contract: ${label}`)
  const result = spawnSync('pnpm', ['exec', 'tsc', '--noEmit'], {
    cwd: appDir,
    encoding: 'utf8',
    env: { ...process.env, NEXT_DIST_DIR: '.next' },
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  process.stdout.write(output)

  if (result.error) {
    throw new Error(`Could not start the Syntropic TypeScript check: ${result.error.message}`)
  }

  return { output, status: result.status ?? 1 }
}

async function fileExists(filePath) {
  try {
    await stat(filePath)
    return true
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

const originalTsconfig = await readFile(tsconfigPath, 'utf8')
const originalNextEnv = await readFile(nextEnvPath, 'utf8')

try {
  const packageJson = JSON.parse(await readFile(path.join(appDir, 'package.json'), 'utf8'))
  if (packageJson.scripts?.typecheck !== 'pnpm run prisma:generate && pnpm exec next typegen && tsc --noEmit') {
    throw new Error('The Syntropic typecheck command must regenerate Next route types before tsc')
  }

  await rm(nextDir, { recursive: true, force: true })
  const cleanRun = runTypecheck('expecting stable route types to be regenerated')
  if (cleanRun.status !== 0) {
    throw new Error(`Expected the clean typecheck to pass, but it exited ${cleanRun.status}`)
  }
  if (!await fileExists(path.join(nextDir, 'types', 'validator.ts'))) {
    throw new Error('The typecheck did not regenerate stable .next/types output')
  }

  await mkdir(path.dirname(devValidator), { recursive: true })
  await writeFile(devValidator, malformedValidator)
  const malformedRun = runTsc('expecting malformed .next/dev output to be ignored')
  if (malformedRun.status !== 0) {
    throw new Error(`Expected the malformed development validator to be ignored, but tsc exited ${malformedRun.status}`)
  }
  if ((await readFile(devValidator, 'utf8')) !== malformedValidator) {
    throw new Error('Next typegen unexpectedly replaced the malformed development validator fixture')
  }

  await writeFile(sourceFixture, deliberateSourceError)
  const sourceErrorRun = runTsc('expecting an application source error to fail')
  if (sourceErrorRun.status === 0) {
    throw new Error('Expected an intentional application source error to fail typecheck')
  }
  if (!sourceErrorRun.output.includes('typecheck-release-contract.fixture.ts')) {
    throw new Error('The failing typecheck output did not identify the application source fixture')
  }

  console.log('typecheck release contract: malformed development output and source-error checks passed')
} finally {
  await Promise.all([
    rm(nextDir, { recursive: true, force: true }),
    rm(sourceFixture, { force: true }),
  ])
  await writeFile(tsconfigPath, originalTsconfig)
  await writeFile(nextEnvPath, originalNextEnv)
}