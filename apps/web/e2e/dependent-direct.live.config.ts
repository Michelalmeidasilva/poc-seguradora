import { defineConfig } from '@playwright/test';
import contracting from './contract-single-flow.live.config';

export default defineConfig({ ...contracting, testMatch: 'dependent-direct.live.ts' });
