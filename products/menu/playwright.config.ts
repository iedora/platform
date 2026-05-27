import { defineConfig, devices } from '@playwright/test'

const PORT = 3000
const BASE_URL = `http://localhost:${PORT}`

/**
 * Env contract for the E2E surface lives in `.env.test`. The
 * `test:e2e*` package.json scripts load it via `bun --env-file=.env.test`,
 * so by the time Playwright reads this config, process.env already has
 * every value the webServer + workers need. We forward process.env to
 * the webServer wholesale and only override NODE_ENV (Cache Components
 * need a production build).
 *
 * Spec discovery follows the vertical-slice convention (CLAUDE.md
 * rule 15): slice-local specs in `src/features/<slice>/e2e/**.spec.ts`
 * + cross-slice journeys in `tests/e2e/journeys/**.spec.ts`.
 */
export default defineConfig({
  testDir: '.',
  testMatch: [
    'src/features/*/e2e/**/*.spec.ts',
    'tests/e2e/journeys/**/*.spec.ts',
  ],
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL: BASE_URL,
    extraHTTPHeaders: { Origin: BASE_URL },
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // CLAUDE.md rule 17: components expose `data-test-id`. Wire
    // `getByTestId()` to that attribute (Playwright's default is the
    // non-hyphenated `data-testid`).
    testIdAttribute: 'data-test-id',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    // CI runs the build in a dedicated step (so Playwright's webServer
    // only has to start it). Local does build + start in one shot.
    // cwd points at apps/web/ — where next build + next start live.
    command: process.env.CI
      ? 'bun run start'
      : 'bun run build && bun run start',
    url: BASE_URL,
    cwd: '../../apps/web',
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: {
      ...process.env,
      NODE_ENV: 'production',
    },
  },
})
