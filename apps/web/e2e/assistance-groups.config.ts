import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: 'assistance-groups.live.ts',
  outputDir: '/tmp/seguradora-assistance-groups-artifacts',
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: process.env.ASSISTANCE_BASE_URL ?? 'http://localhost:8080',
    browserName: 'chromium',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    trace: 'retain-on-failure',
    video: 'on',
  },
});
