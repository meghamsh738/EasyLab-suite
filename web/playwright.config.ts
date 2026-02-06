import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 80_000,
  fullyParallel: true,
  expect: {
    toHaveScreenshot: { animations: 'disabled', caret: 'hide' }
  },
  use: {
    baseURL: 'http://localhost:5178',
    trace: 'on-first-retry',
    viewport: { width: 1440, height: 900 },
    colorScheme: 'light',
    reducedMotion: 'reduce',
    video: 'retain-on-failure'
  },
  webServer: {
    command: 'npm run dev -- --port 5178',
    url: 'http://localhost:5178',
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore'
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chromium'],
        viewport: { width: 1440, height: 900 },
        colorScheme: 'light',
        reducedMotion: 'reduce'
      }
    }
  ]
})
