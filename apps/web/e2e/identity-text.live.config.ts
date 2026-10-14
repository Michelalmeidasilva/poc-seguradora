import { defineConfig } from '@playwright/test';
import contracting from './contract-single-flow.live.config';
export default defineConfig({
  ...contracting,
  testMatch: ['identity-text.live.ts', 'dependent-direct.live.ts'],
});
