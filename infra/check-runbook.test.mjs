import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';
import { checkRunbook } from './check-runbook.mjs';

const roots = [];
after(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));
const valid = `# Deploy
## Pré-requisitos
Ver [README](../infra/README.md) e \`infra/.env\`.
## Configuração
| Chave | Padrão |
| --- | --- |
| \`PROJECT_ID\` | obrigatório |
| \`REGION\` | southamerica-east1 |
Usa \`TF_VAR_project_id\`, \`var.region\`.
## Primeiro deploy
\`bash infra/deploy.sh check\`
\`bash infra/deploy.sh bootstrap\`
\`bash infra/deploy.sh infra apply\`
## Deploy por serviço
\`bash infra/deploy.sh deploy web\`
\`bash infra/deploy.sh build gateway\`
\`bash infra/deploy.sh help\`
\`bash infra/deploy.sh infra plan\`
\`pnpm run infra:deploy status chatbot\`
## Rollback
\`bash infra/deploy.sh rollback gateway --tag antiga\`
## Smoke
\`bash infra/deploy.sh smoke --url https://example.com\`
## TRUST_PROXY_HOPS
## Custos
## Destruição
\`bash infra/deploy.sh destroy --confirm-project projeto\`
## Limites
## Pendências
`;
const commands = [
  'help',
  'check',
  'bootstrap',
  'infra plan',
  'infra apply',
  'build',
  'deploy',
  'rollback',
  'smoke',
  'status',
  'destroy',
];
function fixture(text = valid, help = null) {
  const root = mkdtempSync(join(tmpdir(), 'runbook-'));
  roots.push(root);
  const surface =
    help ??
    [
      ...commands.map((name) => `cmd ${name}  descrição`),
      ...['web', 'gateway', 'chatbot'].map((name) => `service ${name}  descrição`),
      ...['--tag', '--url', '--confirm-project'].map((name) => `flag ${name}  descrição`),
    ].join('\n');
  const files = {
    'docs/deploy.md': text,
    'infra/deploy.sh': `#!/bin/bash\ncat <<'HELP'\n${surface}\nHELP\n`,
    'infra/.env.example': 'PROJECT_ID=example\nREGION=southamerica-east1\n',
    'infra/terraform/variables.tf': 'variable "project_id" {}\nvariable "region" {}\n',
    'infra/terraform/secrets.tf': 'resource "random_password" "session_secret" {}\n',
    'infra/README.md': '',
  };
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}
function rejects(text, pattern) {
  const errors = checkRunbook(fixture(text));
  assert.ok(
    errors.some((error) => pattern.test(error)),
    errors.join('\n'),
  );
}
describe('local runbook consistency', () => {
  it('accepts fixture without private .env or cloud tools', () =>
    assert.deepEqual(checkRunbook(fixture()), []));
  it('checks code paths and relative Markdown links', () => {
    rejects(valid + '\n`infra/nope.sh`', /infra\/nope.sh/);
    rejects(valid + '\n[falta](../docs/nope.md)', /docs\/nope.md/);
    rejects(valid.replace('infra/.env', 'infra/.env.typo'), /infra\/\.env.typo/);
  });
  for (const [label, before, afterText, pattern] of [
    ['unknown command', 'deploy web', 'explode web', /unknown command explode/],
    [
      'missing command',
      '`bash infra/deploy.sh infra plan`',
      '',
      /command infra plan not documented/,
    ],
    ['unknown subcommand', 'infra apply', 'infra preview', /unknown command infra preview/],
    ['unknown service', 'deploy web', 'deploy nope', /unknown service nope/],
    ['unknown flag', '--tag antiga', '--inventada antiga', /unknown flag --inventada/],
    ['unknown env', '| `REGION` |', '| `REGOIN` |', /unknown env.*REGOIN/],
    ['missing env', '| `REGION` | southamerica-east1 |', '', /env.*REGION.*not documented/],
    ['unknown Terraform var', 'var.region', 'var.nope', /unknown Terraform variable "nope"/],
    ['missing section', '## Limites', 'Limites', /missing section "limites"/],
  ])
    it(label, () => rejects(valid.replace(before, afterText), pattern));
  for (const forbidden of [
    'deploy.yml',
    'WIF',
    'environment: production',
    'vars.GCP_PROJECT_ID',
    'Variáveis do GitHub',
  ])
    it(`rejects obsolete ${forbidden}`, () =>
      rejects(valid + `\n${forbidden}`, /obsolete deployment reference/));
  it('checks Terraform references in shell/HCL and resource replacement addresses', () => {
    rejects(valid + '\n```hcl\nnope = 1\n```', /unknown Terraform variable "nope"/);
    rejects(valid + '\nterraform plan -var="nope=1"', /unknown Terraform variable "nope"/);
    rejects(
      valid + "\nTF_CLI_ARGS_plan='-replace=random_password.nope'",
      /resource address.*random_password.nope/,
    );
    assert.deepEqual(
      checkRunbook(fixture(valid + "\nTF_CLI_ARGS_plan='-replace=random_password.session_secret'")),
      [],
    );
  });
  it('reports help failure rather than silently accepting an empty CLI surface', () => {
    const root = fixture();
    writeFileSync(join(root, 'infra/deploy.sh'), 'exit 2\n');
    assert.match(checkRunbook(root).join('\n'), /help failed/);
  });
  it('requires populated service/command/flag help listings', () => {
    assert.match(checkRunbook(fixture(valid, '')).join('\n'), /help has no/);
  });
  it('CLI exits 1 for broken fixture and 0 on the real runbook', () => {
    const script = join(dirname(fileURLToPath(import.meta.url)), 'check-runbook.mjs');
    const bad = spawnSync(
      process.execPath,
      [script, '--root', fixture(valid + '\n`apps/nope/file.ts`')],
      { encoding: 'utf8' },
    );
    assert.equal(bad.status, 1, bad.stdout + bad.stderr);
    assert.match(bad.stderr, /apps\/nope\/file.ts/);
    const real = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    assert.equal(real.status, 0, real.stdout + real.stderr);
    assert.match(real.stdout, /^ok /m);
  });
});
