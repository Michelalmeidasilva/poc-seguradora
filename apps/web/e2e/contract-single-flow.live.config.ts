import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

// Isolated real web/gateway/chatbot servers; no shared Docker stack is changed.
export default defineConfig({
  testDir: '.',
  testMatch: 'contract-single-flow.live.ts',
  timeout: 45_000,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:4186', trace: 'retain-on-failure' },
  webServer: [
    {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      command:
        'python3 -m http.server 4187 --bind 127.0.0.1 --directory ../../docs/prototypes/whatsapp-experience',
      url: 'http://127.0.0.1:4187',
    },
    {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      command: 'pnpm --filter @seguradora/chatbot build && node ../chatbot/dist/main.js',
      url: 'http://127.0.0.1:8291/health',
      timeout: 120_000,
      env: {
        PORT: '8291',
        HOST: '127.0.0.1',
        LOG_LEVEL: 'silent',
        COTACAO_URL: 'http://127.0.0.1:3101',
        APOLICE_URL: 'http://127.0.0.1:3101',
        SINISTRO_URL: 'http://127.0.0.1:3101',
      },
    },
    {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      command: 'pnpm --filter @seguradora/gateway build && node ../gateway/dist/main.js',
      url: 'http://127.0.0.1:8290/health',
      timeout: 120_000,
      env: {
        PORT: '8290',
        HOST: '127.0.0.1',
        LOG_LEVEL: 'silent',
        CHATBOT_URL: 'http://127.0.0.1:8291',
        ALLOWED_ORIGIN: 'http://127.0.0.1:4186',
        SESSION_SECRET: 'public-contract-flow-local-test-secret',
        COOKIE_SECURE: 'false',
        COOKIE_SAME_SITE: 'lax',
        SESSION_CREATE_CAPACITY: '20',
      },
    },
    {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      command: 'pnpm build && pnpm exec vite preview --host 127.0.0.1 --port 4186 --strictPort',
      url: 'http://127.0.0.1:4186',
      timeout: 120_000,
      env: { VITE_PREVIEW_GATEWAY_URL: 'http://127.0.0.1:8290' },
    },
  ],
});
