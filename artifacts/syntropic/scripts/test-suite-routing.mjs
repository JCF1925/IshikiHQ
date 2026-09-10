export const explicitlyEnvironmentDependentTests = new Set([
  'calendar-worker.test.ts',
])

export function environmentDependencyFor(fileName) {
  if (fileName.endsWith('-staging.test.ts')) return 'staging'
  if (fileName.endsWith('-db.test.ts')) return 'database'
  if (explicitlyEnvironmentDependentTests.has(fileName)) return 'database'
  return null
}

export function deterministicTestFiles(fileNames) {
  return fileNames
    .filter((fileName) => fileName.endsWith('.test.ts'))
    .filter((fileName) => environmentDependencyFor(fileName) === null)
    .sort()
}