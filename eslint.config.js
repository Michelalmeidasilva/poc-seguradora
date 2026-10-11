import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['.dependency-cruiser.cjs', '**/node_modules/**', '**/dist/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.mjs', 'scripts/**'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly' } },
  },
  {
    // Node 22 scripts under infra/ (smoke test): runtime globals they use.
    files: ['infra/**/*.mjs'],
    languageOptions: {
      globals: {
        fetch: 'readonly',
        URL: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        TextDecoder: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    files: ['apps/web/src/flows/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/chat/*', '**/app/*', '**/transport/*'],
              message: 'flows/ must not import chat, app or transport.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/web/src/flows/{schema,expr,runtime}.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['react', 'react-dom', 'react/*', 'react-dom/*'], message: 'No React here.' },
            { group: ['../*'], message: 'Core flow modules import nothing outside flows/.' },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/web/src/{chat,app}/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/flows/*', '!**/flows/index'],
              message: 'Import flows only through flows/index.ts.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/web/e2e/**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        URL: 'readonly',
        Buffer: 'readonly',
        crypto: 'readonly',
      },
    },
  },
);
