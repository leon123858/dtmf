import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: process.env.CI ? 180_000 : 120_000,
  expect: { timeout: process.env.CI ? 30_000 : 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { slowMo: process.env.E2E_HEADED === '1' ? 200 : 0 },
  },
  projects: ['fixtures', 'integration'].map(name => ({
    name, testDir: `./e2e/${name}`, outputDir: `test-results/${name}`,
    use: { ...devices['Desktop Chrome'] },
  })),
});
