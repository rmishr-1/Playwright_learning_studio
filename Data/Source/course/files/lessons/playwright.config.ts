import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  // Where the tests are
  testDir: './tests',

  // Run the tests inside each file in parallel, too
  fullyParallel: true,

  // On a CI server, fail the run if a test.only was left in the code
  forbidOnly: !!process.env.CI,

  // Retry failed tests twice on CI, never on your own computer
  retries: process.env.CI ? 2 : 0,

  // On CI, one worker at a time; locally, let Playwright decide
  workers: process.env.CI ? 1 : undefined,

  // Time limits
  timeout: 30_000,                 // each test, with its beforeEach hooks: 30 s
  expect: { timeout: 5_000 },      // each web-first assertion: 5 s

  // Reports: a list in the terminal, and an HTML report that doesn't open by itself
  reporter: [['list'], ['html', { open: 'never' }]],

  // Settings shared by every test in every project
  use: {
    baseURL: 'https://qa-academy.test',   // page.goto('/signin') opens https://qa-academy.test/signin
    trace: 'on-first-retry',              // record a trace when a test is retried
    screenshot: 'only-on-failure',        // attach a screenshot to every failed test
  },

  // One project per browser: every test runs once in each
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
