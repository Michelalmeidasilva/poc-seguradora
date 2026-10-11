import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';
import { checkRunbook } from './check-runbook.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, 'check-runbook.mjs');
const fence = '```';

const VALID = `# Runbook

## Sumário
## Checklist rápido
## Bootstrap
Ver \`infra/smoke.mjs\` e [o README](../infra/README.md).
## Primeiro apply
${fence}bash
terraform -chdir=infra/terraform apply -target=google_artifact_registry_repository.images
terraform apply -var image_tag=abc -var "project_id=<PROJECT_ID>"
terraform apply -replace=random_password.session_secret
${fence}
${fence}hcl
project_id = "<PROJECT_ID>"
# trust_proxy_hops = 3
service_urls = {
  cotacao = "https://x"
}
${fence}
Usa \`var.trust_proxy_hops\`. Links externos não contam: https://github.com/o/r/blob/master/docs/nada.md
## GitHub
### Variáveis do repositório
| Variável | Uso |
|---|---|
| \`GCP_PROJECT_ID\` | projeto |
| \`TF_VAR_TRUST_PROXY_HOPS\` | saltos |
## Smoke pós-deploy
## TRUST_PROXY_HOPS
## Rollback
## Custos
## Destruição
## Pendências
`;

const roots = [];
after(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

function makeRepo(runbook) {
  const root = mkdtempSync(join(tmpdir(), 'check-runbook-'));
  roots.push(root);
  const files = {
    'infra/terraform/variables.tf':
      'variable "project_id" {\n  type = string\n}\nvariable "image_tag" {}\n' +
      'variable "trust_proxy_hops" {}\nvariable "service_urls" {}\n',
    'infra/terraform/main.tf':
      'resource "google_artifact_registry_repository" "images" {\n}\n' +
      'resource "random_password" "session_secret" {}\n',
    '.github/workflows/deploy.yml':
      'env:\n  P: ${{ vars.GCP_PROJECT_ID }}\n  H: ${{ vars.TF_VAR_TRUST_PROXY_HOPS }}\n',
    'infra/smoke.mjs': '',
    'infra/README.md': '',
    'docs/deploy.md': runbook,
  };
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), content);
  }
  return root;
}

const withLine = (text, line) => text.replace('## Rollback', `${line}\n\n## Rollback`);

describe('checkRunbook', () => {
  it('accepts a consistent runbook', () => {
    assert.deepEqual(checkRunbook(makeRepo(VALID)), []);
  });

  it('rejects an empty runbook (sections and GitHub variables missing)', () => {
    const errors = checkRunbook(makeRepo(''));
    assert.ok(
      errors.some((e) => /section.*bootstrap/i.test(e)),
      errors.join('\n'),
    );
    assert.ok(
      errors.some((e) => /section.*pend/i.test(e)),
      errors.join('\n'),
    );
    assert.ok(
      errors.some((e) => /GCP_PROJECT_ID/.test(e)),
      errors.join('\n'),
    );
    assert.ok(
      errors.some((e) => /variable table/i.test(e)),
      errors.join('\n'),
    );
  });

  it('rejects a missing repository path, in code and inline', () => {
    const errors = checkRunbook(
      makeRepo(
        withLine(VALID, `${fence}bash\nbash infra/nope.sh\n${fence}\nVer \`docs/falta.md\`.`),
      ),
    );
    assert.ok(
      errors.some((e) => e.includes('infra/nope.sh')),
      errors.join('\n'),
    );
    assert.ok(
      errors.some((e) => e.includes('docs/falta.md')),
      errors.join('\n'),
    );
  });

  it('rejects unknown Terraform variables in -var, var., TF_VAR_ and tfvars snippets', () => {
    const text = withLine(
      VALID,
      `${fence}bash\nterraform plan -var nope_a=1 -var="nope_b=2"\nexport TF_VAR_nope_c=3\n${fence}\n` +
        `Ver \`var.nope_d\`.\n${fence}hcl\nnope_e = 1\n${fence}`,
    );
    const errors = checkRunbook(makeRepo(text));
    for (const name of ['nope_a', 'nope_b', 'nope_c', 'nope_d', 'nope_e']) {
      assert.ok(
        errors.some((e) => e.includes(`"${name}"`)),
        `${name} not reported:\n${errors.join('\n')}`,
      );
    }
    // Nested keys of a map value are not variables.
    assert.ok(!errors.some((e) => e.includes('"cotacao"')), errors.join('\n'));
  });

  it('rejects a repository variable of the table that the workflow does not use', () => {
    const text = VALID.replace(
      '| `TF_VAR_TRUST_PROXY_HOPS` | saltos |',
      '| `TF_VAR_TRUST_PROXY_HOPS` | saltos |\n| `GCP_INVENTADA` | x |',
    );
    const errors = checkRunbook(makeRepo(text));
    assert.ok(
      errors.some((e) => e.includes('GCP_INVENTADA')),
      errors.join('\n'),
    );
  });

  it('rejects a workflow variable missing from the runbook', () => {
    const errors = checkRunbook(makeRepo(VALID.replaceAll('TF_VAR_TRUST_PROXY_HOPS', 'X')));
    assert.ok(
      errors.some((e) => e.includes('TF_VAR_TRUST_PROXY_HOPS')),
      errors.join('\n'),
    );
  });

  it('rejects a -target or -replace address that no .tf file declares', () => {
    const text = withLine(
      VALID,
      `${fence}bash\nterraform apply -target=google_compute_network.nope -replace=random_password.nope\n${fence}`,
    );
    const errors = checkRunbook(makeRepo(text));
    assert.ok(
      errors.some((e) => e.includes('google_compute_network.nope')),
      errors.join('\n'),
    );
    assert.ok(
      errors.some((e) => e.includes('random_password.nope')),
      errors.join('\n'),
    );
  });

  it('accepts indexed and module-less data addresses of declared resources', () => {
    const text = withLine(
      VALID,
      `${fence}bash\nterraform apply -target='google_artifact_registry_repository.images[0]'\n${fence}`,
    );
    assert.deepEqual(checkRunbook(makeRepo(text)), []);
  });
});

describe('check-runbook CLI', () => {
  it('exits 1 and names the problem for a broken runbook', () => {
    const root = makeRepo(withLine(VALID, 'Ver `apps/nada/x.ts`.'));
    const res = spawnSync(process.execPath, [script, '--root', root], { encoding: 'utf8' });
    assert.equal(res.status, 1, res.stdout + res.stderr);
    assert.match(res.stderr, /apps\/nada\/x\.ts/);
  });

  it('passes on the real repository runbook (docs/deploy.md)', () => {
    const res = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    assert.equal(res.status, 0, res.stdout + res.stderr);
    assert.match(res.stdout, /^ok /m);
  });
});
