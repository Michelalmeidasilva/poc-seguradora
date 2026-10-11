import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The chatbot copies are canonical; the web keeps copies for its unit tests.
const canonicalDir = new URL('./flows/', import.meta.url);
const webDir = new URL('../../../web/src/flows/fixtures/', import.meta.url);

const read = (path: string): unknown => {
  if (!existsSync(path)) throw new Error(`missing Flow JSON: ${path}`);
  return JSON.parse(readFileSync(path, 'utf8'));
};

describe('Flow JSON copies', () => {
  it.each(['cotacao.flow.json', 'demo-componentes.flow.json'])(
    '%s is identical in the chatbot and in the web fixtures',
    (file) => {
      const canonical = fileURLToPath(new URL(file, canonicalDir));
      const web = fileURLToPath(new URL(file, webDir));
      expect(
        read(web),
        `${file} drifted: ${web} must equal the canonical ${canonical}`,
      ).toStrictEqual(read(canonical));
    },
  );
});
