import { readFileSync, writeFileSync } from 'node:fs';
import { URL } from 'node:url';

const root = new URL('./', import.meta.url);
const read = (name) => readFileSync(new URL(name, root), 'utf8');
const source = read('index.html');
const html = source
  .replace(
    '<link rel="stylesheet" href="styles.css" />',
    () => `<style>\n${read('styles.css')}\n</style>`,
  )
  .replace('    <script src="catalog.js" defer></script>\n', '')
  .replace('    <script src="dependent-parser.generated.js" defer></script>\n', '')
  .replace('    <script src="app.js" defer></script>\n', '')
  .replace(
    '</body>',
    () =>
      `<script>\n${read('catalog.js')}\n</script>\n<script>\n${read('dependent-parser.generated.js')}\n</script>\n<script>\n${read('app.js')}\n</script>\n</body>`,
  );
writeFileSync(new URL('atlas-whatsapp.html', root), html);
console.log('Exported atlas-whatsapp.html: standalone, offline, no external assets.');
