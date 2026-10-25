import { defineConfig, devices } from '@playwright/test';

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const port = 4329;

/** Smoke tests run against a preview build, so pending content is present to exercise. */
export default defineConfig({
  testDir: 'tests',
  // The public artifact has its own config (playwright.public.config.ts).
  testIgnore: 'public.spec.ts',
  timeout: 30_000,
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `npm run build:preview && npm run preview -- --host 127.0.0.1 --port ${port} --ignore-lock`,
    url: `http://127.0.0.1:${port}/`,
    timeout: 180_000,
    reuseExistingServer: false,
  },
});
