import { defineConfig } from '@playwright/test';

// Exercises the running Docker stack, without the transport mock used by chat.spec.ts.
export default defineConfig({
  testDir: '.',
  testMatch: [
    'assistance-entry.live.ts',
    'assistance-fidelity.live.ts',
    'assistance-dependent.live.ts',
    'discovery-single-flow.live.ts',
    'discovery-prototype.live.ts',
  ],
  outputDir: '/tmp/seguradora-assistance-entry-artifacts',
  workers: 1,
  // The real gateway allows five new sessions/minute; recovery may wait for its refill.
  timeout: 75_000,
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
