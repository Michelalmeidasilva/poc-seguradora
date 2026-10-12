import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const checker = new URL('./check-skill.mjs', import.meta.url);
const rules = [
  'Nunca passe `--yes` ou `--confirm-project` sem autorização explícita do usuário no pedido atual.',
  'Nunca execute `destroy` por iniciativa própria.',
  'Sempre mostre a saída do plano ao usuário antes de pedir confirmação.',
  'Nunca imprima nem armazene segredos ou o conteúdo de `infra/.env`.',
  'Pare e reporte qualquer saída diferente de zero, com o significado do código de saída.',
  'Se faltar Dockerfile de um svc-*, diga ao usuário que será usada a imagem FAKE.',
  'Não edite `apps/svc-*`.',
];
const frontmatter = (name) =>
  `---\nname: ${name}\ndescription: Use quando precisar desta operação.\n---\n`;
const deploy = () =>
  frontmatter('deploy-service') +
  `
Primeiro execute \`bash infra/deploy.sh check\`.
\`bash infra/deploy.sh help\`
\`bash infra/deploy.sh infra plan\`
\`bash infra/deploy.sh infra apply\`
\`bash infra/deploy.sh deploy web\`
\`bash infra/deploy.sh deploy gateway\`
\`--yes\` \`--confirm-project\` \`--env-file\`
${rules.join('\n')}
`;
const tour = () =>
  frontmatter('monorepo-services') +
  `
## apps/web
\`pnpm --filter @seguradora/web dev\`; veja \`apps/web/package.json\`.
## apps/gateway
\`PORT\` e \`CHATBOT_URL\` em \`apps/gateway/src/config.ts\`.
\`pnpm --filter @seguradora/gateway test\`
## packages/protocol
\`pnpm --filter @seguradora/protocol test\`
## infra/
\`pnpm run infra:deploy help\`; \`infra/.env\` vem de \`infra/.env.example\`.
\`WORKBOARD.md\` mantém donos. \`apps/svc-*\` e \`apps/<futuro>/src\` são caminhos futuros.
`;
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'skill-check-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path, value) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), value);
  };
  write('.agents/skills/deploy-service/SKILL.md', deploy());
  write('.agents/skills/monorepo-services/SKILL.md', tour());
  write(
    'infra/deploy.sh',
    `#!/bin/bash\n[ "$1" = help ] || exit 9\ncat <<'HELP'\nservice web  Frontend\nservice gateway  API\ncmd help  Ajuda\ncmd check  Verificação\ncmd infra plan  Plano\ncmd infra apply  Aplicação\ncmd deploy  Publicar\nflag --yes  Confirmar\nflag --confirm-project  Projeto\nflag --env-file  Arquivo\nHELP\n`,
  );
  write(
    'package.json',
    JSON.stringify({ scripts: { 'infra:deploy': 'bash infra/deploy.sh', test: 'node --test' } }),
  );
  for (const [path, name, scripts] of [
    ['apps/web', '@seguradora/web', { dev: 'vite' }],
    ['apps/gateway', '@seguradora/gateway', { test: 'vitest run' }],
    ['packages/protocol', '@seguradora/protocol', { test: 'vitest run' }],
  ])
    write(`${path}/package.json`, JSON.stringify({ name, scripts }));
  write(
    'apps/gateway/src/config.ts',
    'const config = {\n PORT: z.number(),\n CHATBOT_URL: z.string(),\n};\n',
  );
  write('infra/.env.example', 'PROJECT_ID=example\n');
  write('WORKBOARD.md', '# Ownership\n');
  const edit = (path, fn) => write(path, fn(readFileSync(join(root, path), 'utf8')));
  const run = () => spawnSync(process.execPath, [checker.pathname, root], { encoding: 'utf8' });
  return { root, write, edit, run };
}
const deployPath = '.agents/skills/deploy-service/SKILL.md';
const tourPath = '.agents/skills/monorepo-services/SKILL.md';
const fails = (result, pattern) => {
  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.match(result.stderr, pattern);
};
test('consistent fixture passes; help needs no env/tools and preserves two-word commands', (t) => {
  const { run } = fixture(t);
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /check-skill: ok/);
});
for (const [kind, added, pattern] of [
  ['service', 'service chatbot  Bot', /service.*chatbot.*not documented/],
  ['command', 'cmd rollback  Voltar', /command.*rollback.*not documented/],
  ['flag', 'flag --no-smoke  Sem smoke', /flag.*--no-smoke.*not documented/],
])
  test(`deploy rejects omitted ${kind} from help`, (t) => {
    const { edit, run } = fixture(t);
    edit('infra/deploy.sh', (s) => s.replace('\nHELP', `\n${added}\nHELP`));
    fails(run(), pattern);
  });
for (const [kind, text, pattern] of [
  ['service', '\n`bash infra/deploy.sh deploy phantom`', /unknown service.*phantom/],
  ['command', '\n`bash infra/deploy.sh launch web`', /unknown command.*launch/],
  ['two-word command', '\n`bash infra/deploy.sh infra explode`', /unknown command.*infra explode/],
  ['flag', '\n`--magical`', /unknown flag.*--magical/],
])
  test(`deploy rejects unknown ${kind}`, (t) => {
    const { edit, run } = fixture(t);
    edit(deployPath, (s) => s + text);
    fails(run(), pattern);
  });
for (const path of [deployPath, tourPath])
  test(`${path} requires frontmatter`, (t) => {
    const { edit, run } = fixture(t);
    edit(path, (s) => s.replace(/^---[\s\S]*?---\n/, ''));
    fails(run(), /frontmatter/);
  });
for (const rule of rules)
  test(`deploy pressure rule must survive omission: ${rule}`, (t) => {
    const { edit, run } = fixture(t);
    edit(deployPath, (s) => s.replace(rule, ''));
    fails(run(), /mandatory rule/);
  });
test('deploy requires check as its first executable CLI instruction', (t) => {
  const { edit, run } = fixture(t);
  edit(deployPath, (s) =>
    s.replace(
      'Primeiro execute `bash infra/deploy.sh check`.',
      'Primeiro execute `bash infra/deploy.sh deploy web`.',
    ),
  );
  fails(run(), /first.*check/);
});
for (const workspace of ['apps/new-service', 'packages/new-package'])
  test(`tour requires section for ${workspace}`, (t) => {
    const { write, run } = fixture(t);
    write(`${workspace}/package.json`, '{}');
    fails(run(), /missing section/);
  });
for (const [text, pattern] of [
  ['`pnpm --filter @seguradora/web missing`', /missing script.*missing/],
  ['`pnpm --filter @seguradora/ghost test`', /unknown workspace.*ghost/],
  ['`pnpm imaginary`', /missing script.*imaginary/],
  ['`pnpm run imaginary`', /missing script.*imaginary/],
  ['`infra/missing.env`', /path.*infra\/missing.env.*does not exist/],
  ['infra/missing-plain.mjs', /path.*infra\/missing-plain.mjs.*does not exist/],
  ['| gateway | `in_progress` |', /copied status table/],
  ['| gateway | not_started |', /copied status table/],
  ['| gateway | done |', /copied status table/],
])
  test(`tour rejects ${text}`, (t) => {
    const { edit, run } = fixture(t);
    edit(tourPath, (s) => s + '\n' + text);
    fails(run(), pattern);
  });
test('tour rejects env variables absent from the owning config', (t) => {
  const { edit, run } = fixture(t);
  edit(tourPath, (s) => s.replace('`CHATBOT_URL`', '`INVENTED_URL`'));
  fails(run(), /unknown env.*INVENTED_URL.*gateway/);
});
test('ignored infra/.env exception requires its tracked template', (t) => {
  const { root, run } = fixture(t);
  rmSync(join(root, 'infra/.env.example'));
  fails(run(), /path.*infra\/\.env.*does not exist/);
});
test('help failure is reported without hiding the exit status', (t) => {
  const { write, run } = fixture(t);
  write('infra/deploy.sh', '#!/bin/bash\nexit 7\n');
  fails(run(), /help.*exit 7/);
});

test('tour checks root file code spans and scripts paths too', (t) => {
  const { edit, run } = fixture(t);
  edit(tourPath, (s) => s + '\n`missing.json` e `scripts/missing.mjs`.');
  const result = run();
  fails(result, /path.*missing.json.*does not exist/);
  assert.match(result.stderr, /path.*scripts\/missing.mjs.*does not exist/);
});

test('tour scripts inside fenced commands are checked without treating prose as commands', (t) => {
  const { edit, run } = fixture(t);
  edit(tourPath, (s) => s + '\npnpm nas versões apropriadas.\n```bash\npnpm run test\n```');
  assert.equal(run().status, 0);
});
