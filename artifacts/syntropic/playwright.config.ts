import { defineConfig } from '@playwright/test'

const port = process.env.PLAYWRIGHT_PORT ?? '3100'
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${port}`

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  reporter: process.env.CI
    ? [['line'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
    : 'list',
  use: {
    baseURL,
    locale: 'en-AU',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // The Replit image supplies Chromium but not Playwright's optional ffmpeg
    // bundle; traces and screenshots still preserve actionable failures.
    video: 'off',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/repl/tools/bin/chromium',
      args: ['--disable-dev-shm-usage'],
    },
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'pnpm run dev',
        cwd: '.',
        env: {
          PORT: port,
          AUTH_URL: baseURL,
          NEXTAUTH_URL: baseURL,
        },
        url: `${baseURL}/login`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'recreated-account',
      testMatch: /recreated-account-health\.spec\.ts/,
      use: {
        storageState: undefined,
      },
    },
    {
      name: 'signup-destination',
      testMatch: /signup-destination\.spec\.ts/,
      use: {
        storageState: undefined,
      },
    },
    {
      name: 'chromium',
      dependencies: ['setup'],
      testIgnore: /(?:auth\.setup|recreated-account-health|signup-destination)\.spec\.ts/,
      use: {
        storageState: 'test-results/.auth/user.json',
      },
    },
  ],
})