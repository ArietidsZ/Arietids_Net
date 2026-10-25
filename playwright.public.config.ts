import { defineConfig, devices } from '@playwright/test';

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const port = 4330;

/** The artifact that ships: built with `npm run build` (public mode, all checks), then served as is. */
export default defineConfig({
  testDir: 'tests',
  testMatch: ['public.spec.ts', 'regressions-visual.spec.ts', 'runtime.spec.ts', 'sky-runtime.spec.ts', 'clipboard.spec.ts', 'blog.spec.ts'],
  timeout: 45_000,
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
    command: `npm run build && npm run preview:public -- --host 127.0.0.1 --port ${port} --ignore-lock`,
    url: `http://127.0.0.1:${port}/`,
    timeout: 240_000,
    reuseExistingServer: false,
  },
});
