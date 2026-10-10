import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  clean: true,
  sourcemap: true,
  // Workspace packages are TypeScript sources; inline them. Third-party deps stay external.
  noExternal: [/^@seguradora\//],
});
