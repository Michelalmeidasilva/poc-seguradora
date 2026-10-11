import { defineConfig } from '@playwright/test';

const MOCK_PORT = 8099;
const WEB_PORT = 4173;

// Note: reuseExistingServer (when CI is unset) can serve a stale dist/mock locally; set CI=1 or stop
// the servers on ports 8099/4173 to force a fresh build.
export default defineConfig({
  testDir: './e2e',
  timeout: 20_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  use: { baseURL: `http://127.0.0.1:${WEB_PORT}`, trace: 'retain-on-failure' },
  webServer: [
    {
      command: 'node e2e/mock-gateway.mjs',
      port: MOCK_PORT,
      reuseExistingServer: !process.env.CI,
      env: { MOCK_GATEWAY_PORT: String(MOCK_PORT) },
    },
    {
      command: `pnpm build && pnpm exec vite preview --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      port: WEB_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { VITE_PREVIEW_GATEWAY_URL: `http://127.0.0.1:${MOCK_PORT}` },
    },
  ],
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
