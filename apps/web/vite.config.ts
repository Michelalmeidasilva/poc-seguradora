import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const gateway = process.env.VITE_DEV_GATEWAY_URL ?? 'http://localhost:8080';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Same-origin API in development: the browser talks to Vite, which forwards /v1 to the gateway.
    proxy: { '/v1': { target: gateway, changeOrigin: false } },
  },
  preview: {
    port: 4173,
    proxy: {
      '/v1': { target: process.env.VITE_PREVIEW_GATEWAY_URL ?? gateway, changeOrigin: false },
    },
  },
  build: { sourcemap: true, target: 'es2022' },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
