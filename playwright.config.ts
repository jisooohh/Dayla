import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:3101',
    viewport: { width: 1440, height: 1100 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm start',
    env: { PORT: '3101', DAYLA_DB_PATH: 'var/e2e.sqlite' },
    url: 'http://127.0.0.1:3101/api/status',
    reuseExistingServer: false,
  },
});
