# Fundação, Protocolo e Resiliência: Plano de Implementação (Plano 1 de 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar o monorepo pnpm com o controle de trabalho entre agentes (`WORKBOARD.md`) e entregar os dois pacotes compartilhados, `@seguradora/protocol` (schemas Zod do protocolo SSE + POST) e `@seguradora/resilience` (timeout, retry, circuit breaker, bulkhead), totalmente testados.

**Architecture:** Monorepo pnpm com `apps/*` (esqueletos vazios nesta fase) e `packages/*`. Os pacotes são TypeScript consumidos como código-fonte (sem etapa de build): `exports` aponta para `src/index.ts`. O controle de trabalho é um arquivo Markdown validado por um script Node sem dependências.

**Tech Stack:** Node ≥ 20, pnpm workspaces, TypeScript estrito, Zod 3, Vitest 2, ESLint 9 (flat config) + typescript-eslint, Prettier, `node:test` para o script de validação, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-10-whatsapp-chatbot-poc-design.md` (seções 3, 10, 14, 15). Contratos dos serviços internos: `docs/superpowers/specs/2026-10-10-internal-services-contracts.md` (não faz parte deste plano; outro agente os implementa).

## Planos seguintes (fora deste plano)

| Plano | Entrega | Depende de |
|---|---|---|
| 2 | `apps/gateway`: sessão/JWT, SSE, `POST /v1/events`, buffer de reenvio, rate limit, cliente do chatbot | Plano 1 |
| 3 | `apps/chatbot`: API NDJSON, máquina de estados, `LlmProvider` mock, `catalog`, clientes dos serviços | Plano 1 (e contratos de serviços) |
| 4 | `apps/web` chat: transporte SSE, fila de reenvio, renderers de mensagem | Plano 1 |
| 5 | `apps/web` Flows: motor de expressões, componentes, ações | Planos 1 e 4 |
| (outro agente) | `svc-cotacao`, `svc-apolice`, `svc-sinistro` | documento de contratos |

Os Planos 2 a 5 também incluem o `dependency-cruiser` e o Dockerfile/deploy de cada app. As tarefas 3 e 4 deste plano são independentes e podem ser executadas por agentes diferentes em paralelo (frentes `protocol` e `resilience` do `WORKBOARD.md`).

## Global Constraints

- Um único repositório git, na raiz `seguradora-services/`. Nunca rodar `git init` dentro de `apps/*` ou `packages/*`.
- Monorepo pnpm; TypeScript com `strict: true`; Node ≥ 20.
- Validação nas bordas com Zod 3 (`zod@^3.23`). Erros esperados como valores (`Result`), exceções só para o inesperado.
- Estrutura hexagonal `domain` / `application` / `infra` / `main.ts` nos serviços (planos 2, 3 e outro agente). Pacotes não seguem essa estrutura.
- Envelope: `{ v: 1, id, seq, sessionId, correlationId, ts, type, payload }`. `seq` só no sentido servidor→cliente.
- Códigos de erro estáveis: `rate_limited`, `invalid_schema`, `upstream_unavailable`, `unauthorized`, `payload_too_large`, `internal_error`.
- `WORKBOARD.md`: `Status` ∈ `not_started` | `in_progress` | `blocked` | `done`; `Dono` ∈ `claude` | `codex` | `cursor` | `antigravity` | `human:<nome>` | `-`.
- Commits convencionais (`feat:`, `fix:`, `docs:`, `chore:`, `test:`). Atualizar o `CHECKLIST.md` no mesmo commit que conclui o item.
- Identificadores e comentários de código em inglês; documentação em português.

## Review Focus

Entradas que o spec não detalha e que mais provavelmente quebram:

1. **`WORKBOARD.md` com finais de linha CRLF** (editado no Windows) deve ser lido normalmente. Teste na Tarefa 2.
2. **`user.text` só com espaços** deve ser rejeitado, não entregue ao chatbot. Teste na Tarefa 3.
3. **Campos extras no payload do cliente** (por exemplo `{ "text": "oi", "admin": true }`) devem ser rejeitados, não ignorados em silêncio. Teste na Tarefa 3.
4. **Limites zero:** `retry` com `retries: 0` chama a função uma vez; `Bulkhead` com `maxQueue: 0` rejeita imediatamente quando cheio. Testes na Tarefa 4.
5. **Função que lança de forma síncrona** (sem retornar Promise) deve ser tratada como falha comum por `retry` e `withTimeout`, não escapar. Testes na Tarefa 4.

---

## Estrutura de arquivos

```
.gitignore  .prettierrc.json  eslint.config.js  package.json
pnpm-workspace.yaml  tsconfig.base.json
WORKBOARD.md  AGENTS.md  CLAUDE.md  GEMINI.md
.cursor/rules/workboard.mdc  .github/copilot-instructions.md
.github/workflows/ci.yml
scripts/workboard-check.mjs  scripts/workboard-check.test.mjs
apps/{web,gateway,chatbot,svc-cotacao,svc-apolice,svc-sinistro}/{package.json,CHECKLIST.md}
apps/web/src/{chat,renderers,transport,flows}/.gitkeep
packages/protocol/{package.json,tsconfig.json,CHECKLIST.md}
packages/protocol/src/{index,limits,result,payloads,client-payloads,events}.ts  + testes
packages/resilience/{package.json,tsconfig.json,CHECKLIST.md}
packages/resilience/src/{index,timeout,retry,circuit-breaker,bulkhead,policy}.ts  + testes
```

Já existem e não devem ser alterados: `docs/`, `.agents/skills/workboard-protocol/`, os symlinks `.claude/skills/workboard-protocol` e `.agent/skills/workboard-protocol`.

---

### Task 1: Scaffold do monorepo

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `.prettierrc.json`, `eslint.config.js`
- Create: `apps/<web|gateway|chatbot|svc-cotacao|svc-apolice|svc-sinistro>/package.json` e `CHECKLIST.md`
- Create: `apps/web/src/{chat,renderers,transport,flows}/.gitkeep`
- Create: `packages/{protocol,resilience}/{package.json,tsconfig.json,CHECKLIST.md}`

**Interfaces:**
- Produces: nomes dos pacotes `@seguradora/protocol` e `@seguradora/resilience`; scripts raiz `typecheck`, `lint`, `format`, `test`, `check:workboard`; scripts de pacote `test` (`vitest run`) e `typecheck` (`tsc --noEmit`).

- [ ] **Step 1: Confirmar o repositório e as ferramentas**

Run: `git rev-parse --show-toplevel && node --version && pnpm --version`
Expected: o caminho termina em `seguradora-services`; Node `v20` ou superior; pnpm imprime uma versão. Se o pnpm não existir: `corepack enable` e repetir.

- [ ] **Step 2: Criar os arquivos de configuração da raiz**

`package.json`:
```json
{
  "name": "seguradora-services",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "typecheck": "pnpm -r typecheck",
    "lint": "eslint .",
    "format": "prettier --write .",
    "test": "pnpm -r test && node --test scripts/workboard-check.test.mjs",
    "check:workboard": "node scripts/workboard-check.mjs"
  },
  "devDependencies": {
    "@eslint/js": "^9.0.0",
    "@types/node": "^20.0.0",
    "eslint": "^9.0.0",
    "prettier": "^3.3.0",
    "typescript": "^5.5.0",
    "typescript-eslint": "^8.0.0",
    "vitest": "^2.1.0"
  }
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["node"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true
  }
}
```

`.gitignore`:
```
node_modules/
dist/
coverage/
.env
.env.*
.DS_Store
.claude/settings.local.json
```

`.prettierrc.json`:
```json
{ "singleQuote": true, "semi": true, "printWidth": 100, "trailingComma": "all" }
```

`eslint.config.js`:
```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.mjs', 'scripts/**'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly' } },
  },
);
```

- [ ] **Step 3: Criar os `package.json` dos apps (esqueletos)**

Cada um com o conteúdo abaixo, trocando `<nome>`. Nesta fase eles não têm scripts, para que `pnpm -r test` os ignore.

`apps/<nome>/package.json`:
```json
{
  "name": "@seguradora/<nome>",
  "private": true,
  "version": "0.0.0",
  "type": "module"
}
```
Nomes: `web`, `gateway`, `chatbot`, `svc-cotacao`, `svc-apolice`, `svc-sinistro`.

Criar também as pastas da web, cada uma com um arquivo vazio `.gitkeep`: `apps/web/src/chat/`, `apps/web/src/renderers/`, `apps/web/src/transport/`, `apps/web/src/flows/`.

- [ ] **Step 4: Criar os `package.json` e `tsconfig.json` dos pacotes**

`packages/protocol/package.json`:
```json
{
  "name": "@seguradora/protocol",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "dependencies": { "zod": "^3.23.0" }
}
```

`packages/resilience/package.json`:
```json
{
  "name": "@seguradora/resilience",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  }
}
```

`packages/protocol/tsconfig.json` e `packages/resilience/tsconfig.json` (idênticos):
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

- [ ] **Step 5: Criar os `CHECKLIST.md` (um por app e pacote)**

Todos começam com a data `2026-10-10` e todos os itens em aberto. Conteúdo exato de cada arquivo:

`apps/svc-cotacao/CHECKLIST.md`:
```markdown
# Checklist: svc-cotacao

Última atualização: 2026-10-10

## Estrutura
- [ ] Pastas hexagonais criadas (domain / application / infra / main.ts)
- [ ] Configuração por variáveis de ambiente validada na subida
- [ ] Dockerfile e execução local

## Funcionalidades
- [ ] GET /v1/produtos
- [ ] POST /v1/cotacoes
- [ ] GET /v1/cotacoes/{cotacaoId}
- [ ] openapi.yaml fiel ao contrato
- [ ] Fixtures em data/*.json
- [ ] Injeção de falha (X-Mock-Latency-Ms, X-Mock-Error)
- [ ] /health e /ready

## Qualidade
- [ ] Testes unitários (domain e application)
- [ ] Testes de contrato
- [ ] Lint, formatação e tsconfig estrito sem erros

## Pendências e decisões
- Nenhuma.
```

`apps/svc-apolice/CHECKLIST.md`: mesmo modelo, título `svc-apolice`, e o bloco Funcionalidades:
```markdown
- [ ] GET /v1/apolices?cpf=
- [ ] GET /v1/apolices/{numero}
- [ ] GET /v1/apolices/{numero}/segunda-via
- [ ] openapi.yaml fiel ao contrato
- [ ] Fixtures em data/*.json
- [ ] Injeção de falha (X-Mock-Latency-Ms, X-Mock-Error)
- [ ] /health e /ready
```

`apps/svc-sinistro/CHECKLIST.md`: mesmo modelo, título `svc-sinistro`, e o bloco Funcionalidades:
```markdown
- [ ] POST /v1/sinistros
- [ ] GET /v1/sinistros/{protocolo}
- [ ] GET /v1/sinistros?apolice=
- [ ] openapi.yaml fiel ao contrato
- [ ] Fixtures em data/*.json
- [ ] Injeção de falha (X-Mock-Latency-Ms, X-Mock-Error)
- [ ] /health e /ready
```

`apps/gateway/CHECKLIST.md`: mesmo modelo (Estrutura e Qualidade idênticos), título `gateway`, Funcionalidades:
```markdown
- [ ] Sessão anônima (JWT em cookie HttpOnly)
- [ ] GET /v1/stream (SSE, heartbeat, Last-Event-ID)
- [ ] POST /v1/events (validação, idempotência por id)
- [ ] Buffer de reenvio por sessão
- [ ] Rate limit e limites de payload
- [ ] Cliente do chatbot (NDJSON) com resiliência
```

`apps/chatbot/CHECKLIST.md`: mesmo modelo, título `chatbot`, Funcionalidades:
```markdown
- [ ] API em stream NDJSON
- [ ] Máquina de estados do diálogo
- [ ] LlmProvider (interface) e mock determinístico
- [ ] Catálogo de mensagens e Flows
- [ ] Clientes dos serviços internos com resiliência
- [ ] Idempotência por id
```

`apps/web/CHECKLIST.md`: mesmo modelo, título `web`, Funcionalidades:
```markdown
- [ ] Transporte SSE + POST e fila de reenvio
- [ ] Renderers: texto, voz, código, location, template, carousel, quick-reply, digitando
- [ ] Motor de expressões de Flows
- [ ] Componentes de Flows (texto, entrada, navegação, estruturais)
- [ ] Ações de Flows (navigate, complete, data_exchange, open_url, update_data)
- [ ] Tema claro e escuro, acessibilidade
- [ ] E2E (Playwright)
```

`packages/protocol/CHECKLIST.md`:
```markdown
# Checklist: protocol

Última atualização: 2026-10-10

## Estrutura
- [ ] Pacote com exports e tsconfig
- [ ] Limites e códigos de erro em limits.ts
- [ ] Result type

## Funcionalidades
- [ ] Schemas das mensagens servidor→cliente (12 tipos)
- [ ] Schemas dos eventos cliente→servidor (7 tipos)
- [ ] parseServerEvent e parseClientEvent
- [ ] Campo flowJson refinado pelo schema de Flow JSON (Plano 5)

## Qualidade
- [ ] Testes unitários
- [ ] Lint, formatação e tsconfig estrito sem erros

## Pendências e decisões
- flowJson é um registro genérico até o Plano 5.
```

`packages/resilience/CHECKLIST.md`:
```markdown
# Checklist: resilience

Última atualização: 2026-10-10

## Estrutura
- [ ] Pacote com exports e tsconfig

## Funcionalidades
- [ ] withTimeout
- [ ] retry com backoff e jitter
- [ ] CircuitBreaker
- [ ] Bulkhead
- [ ] createPolicy (composição)

## Qualidade
- [ ] Testes unitários
- [ ] Lint, formatação e tsconfig estrito sem erros

## Pendências e decisões
- Nenhuma.
```

Para `gateway`, `chatbot` e `web`, os blocos Estrutura e Qualidade são idênticos aos de `svc-cotacao` (acima), com o título trocado. Os `CHECKLIST.md` dos outros dois serviços (`svc-apolice`, `svc-sinistro`) também.

- [ ] **Step 6: Instalar e verificar**

Run: `pnpm install`
Expected: termina sem erro e cria `pnpm-lock.yaml`.

Run: `pnpm -r ls --depth -1`
Expected: lista 8 projetos (`@seguradora/web`, `gateway`, `chatbot`, `svc-cotacao`, `svc-apolice`, `svc-sinistro`, `protocol`, `resilience`) mais a raiz.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold pnpm monorepo with checklists"
```

---

### Task 2: Controle de trabalho entre agentes (`WORKBOARD.md`)

**Files:**
- Create: `scripts/workboard-check.test.mjs`, `scripts/workboard-check.mjs`
- Create: `WORKBOARD.md`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursor/rules/workboard.mdc`, `.github/copilot-instructions.md`

**Interfaces:**
- Produces (de `scripts/workboard-check.mjs`):
  - `parseWorkboard(text: string): { rows: Row[]; errors: string[] }`
  - `validateRows(rows: Row[], exists?: (path: string) => boolean): string[]`
  - `overlaps(a: string, b: string): boolean`
  - `checkRepo(root: string): string[]` (lista de erros; vazia = ok)
  - `Row = { line: number; workstream: string; paths: string[]; status: string; owner: string; branch: string; started: string; updated: string; notes: string }`
  - CLI: `node scripts/workboard-check.mjs [raiz]` sai com código 1 e imprime os erros, ou 0.

- [ ] **Step 1: Escrever os testes que falham**

`scripts/workboard-check.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { parseWorkboard, validateRows, overlaps, checkRepo } from './workboard-check.mjs';

const HEADER =
  '| Workstream | Caminho | Status | Dono | Branch | Iniciado | Atualizado | Notas |\n' +
  '|---|---|---|---|---|---|---|---|\n';

const row = (o = {}) => {
  const r = {
    workstream: 'protocol',
    path: 'packages/protocol',
    status: 'not_started',
    owner: '-',
    branch: '-',
    started: '-',
    updated: '-',
    notes: '',
    ...o,
  };
  return `| ${r.workstream} | ${r.path} | ${r.status} | ${r.owner} | ${r.branch} | ${r.started} | ${r.updated} | ${r.notes} |`;
};

const board = (...rows) => HEADER + rows.join('\n') + '\n';

test('parseWorkboard reads a valid row', () => {
  const { rows, errors } = parseWorkboard(board(row()));
  assert.deepEqual(errors, []);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].workstream, 'protocol');
  assert.deepEqual(rows[0].paths, ['packages/protocol']);
  assert.equal(rows[0].status, 'not_started');
  assert.equal(rows[0].notes, '');
});

test('parseWorkboard accepts CRLF line endings', () => {
  const text = board(row()).replace(/\n/g, '\r\n');
  const { rows, errors } = parseWorkboard(text);
  assert.deepEqual(errors, []);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'not_started');
});

test('parseWorkboard splits comma separated paths and strips backticks', () => {
  const { rows } = parseWorkboard(board(row({ path: '`apps/web/src/chat`, `apps/web/src/transport`' })));
  assert.deepEqual(rows[0].paths, ['apps/web/src/chat', 'apps/web/src/transport']);
});

test('parseWorkboard reports a wrong column count', () => {
  const { errors } = parseWorkboard(HEADER + '| only | three | cols |\n');
  assert.equal(errors.length, 1);
  assert.match(errors[0], /expected 8 columns/);
});

test('parseWorkboard reports a missing header', () => {
  const { errors } = parseWorkboard('# nothing here\n');
  assert.match(errors[0], /header row not found/);
});

test('parseWorkboard reports a wrong header', () => {
  const bad = board(row()).replace('Dono', 'Owner');
  const { errors } = parseWorkboard(bad);
  assert.match(errors[0], /header must be/);
});

const parse = (...rows) => parseWorkboard(board(...rows)).rows;

test('validateRows accepts a consistent board', () => {
  const rows = parse(
    row(),
    row({
      workstream: 'resilience',
      path: 'packages/resilience',
      status: 'in_progress',
      owner: 'claude',
      branch: 'feat/resilience',
      started: '2026-10-10',
      updated: '2026-10-10',
    }),
  );
  assert.deepEqual(validateRows(rows), []);
});

test('validateRows rejects an invalid status and an invalid owner', () => {
  const errors = validateRows(parse(row({ status: 'doing', owner: 'bob' })));
  assert.ok(errors.some((e) => /invalid status "doing"/.test(e)));
  assert.ok(errors.some((e) => /invalid owner "bob"/.test(e)));
});

test('validateRows accepts a human owner', () => {
  const rows = parse(
    row({ status: 'in_progress', owner: 'human:maria', branch: 'b', started: '2026-10-10' }),
  );
  assert.deepEqual(validateRows(rows), []);
});

test('validateRows requires owner, branch and start date for in_progress and blocked', () => {
  for (const status of ['in_progress', 'blocked']) {
    const errors = validateRows(parse(row({ status })));
    assert.ok(errors.some((e) => /requires an owner/.test(e)), status);
    assert.ok(errors.some((e) => /requires a branch/.test(e)), status);
    assert.ok(errors.some((e) => /requires a start date/.test(e)), status);
  }
});

test('validateRows rejects an owner on a not_started row', () => {
  const errors = validateRows(parse(row({ owner: 'claude' })));
  assert.ok(errors.some((e) => /not_started must not have an owner/.test(e)));
});

test('validateRows rejects duplicate workstreams', () => {
  const errors = validateRows(parse(row(), row({ path: 'packages/other' })));
  assert.ok(errors.some((e) => /duplicate workstream/.test(e)));
});

test('overlaps works on path segments', () => {
  assert.equal(overlaps('apps/web', 'apps/web/src/chat'), true);
  assert.equal(overlaps('apps/web/src/chat', 'apps/web/src/flows'), false);
  assert.equal(overlaps('apps/web2', 'apps/web'), false);
  assert.equal(overlaps('apps/web/', 'apps/web'), true);
});

test('validateRows rejects overlapping paths of rows that are not done', () => {
  const errors = validateRows(
    parse(
      row({ workstream: 'web', path: 'apps/web' }),
      row({ workstream: 'web-chat', path: 'apps/web/src/chat' }),
    ),
  );
  assert.ok(errors.some((e) => /overlap/.test(e)));
});

test('validateRows ignores overlap when one of the rows is done', () => {
  const errors = validateRows(
    parse(
      row({ workstream: 'web', path: 'apps/web', status: 'done', owner: 'claude' }),
      row({ workstream: 'web-chat', path: 'apps/web/src/chat' }),
    ),
  );
  assert.deepEqual(errors, []);
});

test('validateRows reports paths that do not exist', () => {
  const errors = validateRows(parse(row()), () => false);
  assert.ok(errors.some((e) => /does not exist/.test(e)));
});

const makeRepo = (root, { workboard } = {}) => {
  const write = (rel, content) => {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), content);
  };
  mkdirSync(join(root, 'packages/protocol'), { recursive: true });
  write('WORKBOARD.md', workboard ?? board(row()));
  write('AGENTS.md', '# rules\n');
  for (const p of [
    'CLAUDE.md',
    'GEMINI.md',
    '.cursor/rules/workboard.mdc',
    '.github/copilot-instructions.md',
  ]) {
    write(p, 'See AGENTS.md\n');
  }
  write('.agents/skills/workboard-protocol/SKILL.md', '---\nname: workboard-protocol\n---\n');
  for (const l of ['.claude/skills/workboard-protocol', '.agent/skills/workboard-protocol']) {
    mkdirSync(dirname(join(root, l)), { recursive: true });
    symlinkSync('../../.agents/skills/workboard-protocol', join(root, l));
  }
};

test('checkRepo passes on a complete repository', () => {
  const root = mkdtempSync(join(tmpdir(), 'wb-ok-'));
  makeRepo(root);
  assert.deepEqual(checkRepo(root), []);
});

test('checkRepo reports a missing WORKBOARD.md', () => {
  const root = mkdtempSync(join(tmpdir(), 'wb-empty-'));
  assert.deepEqual(checkRepo(root), ['WORKBOARD.md not found']);
});

test('checkRepo reports a pointer that does not mention AGENTS.md', () => {
  const root = mkdtempSync(join(tmpdir(), 'wb-ptr-'));
  makeRepo(root);
  writeFileSync(join(root, 'CLAUDE.md'), 'nothing useful\n');
  assert.ok(checkRepo(root).some((e) => /CLAUDE\.md must mention AGENTS\.md/.test(e)));
});

test('checkRepo reports a skill symlink that is missing', () => {
  const root = mkdtempSync(join(tmpdir(), 'wb-skill-missing-'));
  makeRepo(root);
  rmSync(join(root, '.agent/skills/workboard-protocol'));
  assert.ok(checkRepo(root).some((e) => /\.agent\/skills\/workboard-protocol missing/.test(e)));
});

test('checkRepo reports a skill symlink that points to the wrong place', () => {
  const root = mkdtempSync(join(tmpdir(), 'wb-skill-wrong-'));
  makeRepo(root);
  mkdirSync(join(root, 'elsewhere'), { recursive: true });
  rmSync(join(root, '.claude/skills/workboard-protocol'));
  symlinkSync('../../elsewhere', join(root, '.claude/skills/workboard-protocol'));
  assert.ok(
    checkRepo(root).some((e) => /\.claude\/skills\/workboard-protocol must resolve/.test(e)),
  );
});
```

- [ ] **Step 2: Rodar os testes e ver falhar**

Run: `node --test scripts/workboard-check.test.mjs`
Expected: FAIL, com `Cannot find module` apontando para `workboard-check.mjs`.

- [ ] **Step 3: Implementar o script**

`scripts/workboard-check.mjs`:
```js
import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const STATUSES = ['not_started', 'in_progress', 'blocked', 'done'];
export const OWNER_RE = /^(claude|codex|cursor|antigravity|human:[^\s|]+|-)$/;
export const HEADER = [
  'Workstream',
  'Caminho',
  'Status',
  'Dono',
  'Branch',
  'Iniciado',
  'Atualizado',
  'Notas',
];
export const POINTERS = [
  'CLAUDE.md',
  'GEMINI.md',
  '.cursor/rules/workboard.mdc',
  '.github/copilot-instructions.md',
];
export const SKILL_REAL = '.agents/skills/workboard-protocol';
export const SKILL_LINKS = ['.claude/skills/workboard-protocol', '.agent/skills/workboard-protocol'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const splitCells = (line) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());

export function parseWorkboard(text) {
  const errors = [];
  const lines = text.split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => l.trim().startsWith('| Workstream'));
  if (headerIdx === -1) return { rows: [], errors: ['header row not found'] };

  const header = splitCells(lines[headerIdx]);
  if (header.join('|') !== HEADER.join('|')) {
    errors.push(`header must be: ${HEADER.join(' | ')}`);
  }

  const rows = [];
  for (let i = headerIdx + 2; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim().startsWith('|')) break;
    const c = splitCells(line);
    if (c.length !== HEADER.length) {
      errors.push(`line ${i + 1}: expected ${HEADER.length} columns, got ${c.length}`);
      continue;
    }
    rows.push({
      line: i + 1,
      workstream: c[0],
      paths: c[1]
        .replace(/`/g, '')
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean),
      status: c[2],
      owner: c[3],
      branch: c[4],
      started: c[5],
      updated: c[6],
      notes: c[7],
    });
  }
  return { rows, errors };
}

const segments = (p) => p.replace(/\/+$/, '').split('/');

export function overlaps(a, b) {
  const x = segments(a);
  const y = segments(b);
  const n = Math.min(x.length, y.length);
  return x.slice(0, n).join('/') === y.slice(0, n).join('/');
}

export function validateRows(rows, exists = () => true) {
  const errors = [];
  const seen = new Set();

  for (const r of rows) {
    const at = `line ${r.line} (${r.workstream})`;
    if (seen.has(r.workstream)) errors.push(`${at}: duplicate workstream`);
    seen.add(r.workstream);

    if (!STATUSES.includes(r.status)) errors.push(`${at}: invalid status "${r.status}"`);
    if (!OWNER_RE.test(r.owner)) errors.push(`${at}: invalid owner "${r.owner}"`);

    if (r.status === 'in_progress' || r.status === 'blocked') {
      if (r.owner === '-') errors.push(`${at}: ${r.status} requires an owner`);
      if (r.branch === '-' || r.branch === '') errors.push(`${at}: ${r.status} requires a branch`);
      if (!DATE_RE.test(r.started)) {
        errors.push(`${at}: ${r.status} requires a start date (YYYY-MM-DD)`);
      }
    }
    if (r.status === 'not_started' && r.owner !== '-') {
      errors.push(`${at}: not_started must not have an owner`);
    }
    for (const p of r.paths) {
      if (!exists(p)) errors.push(`${at}: path "${p}" does not exist`);
    }
  }

  const active = rows.filter((r) => r.status !== 'done');
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      const clash = a.paths.some((pa) => b.paths.some((pb) => overlaps(pa, pb)));
      if (clash) errors.push(`paths overlap: ${a.workstream} and ${b.workstream}`);
    }
  }
  return errors;
}

export function checkRepo(root) {
  const wbFile = join(root, 'WORKBOARD.md');
  if (!existsSync(wbFile)) return ['WORKBOARD.md not found'];

  const { rows, errors: parseErrors } = parseWorkboard(readFileSync(wbFile, 'utf8'));
  const errors = [
    ...parseErrors,
    ...validateRows(rows, (p) => existsSync(join(root, p))),
  ];

  if (!existsSync(join(root, 'AGENTS.md'))) errors.push('AGENTS.md not found');
  for (const p of POINTERS) {
    const f = join(root, p);
    if (!existsSync(f)) errors.push(`${p} not found`);
    else if (!readFileSync(f, 'utf8').includes('AGENTS.md')) {
      errors.push(`${p} must mention AGENTS.md`);
    }
  }

  const real = join(root, SKILL_REAL);
  if (!existsSync(real)) errors.push(`${SKILL_REAL} not found`);
  for (const l of SKILL_LINKS) {
    const f = join(root, l);
    if (!existsSync(f)) {
      errors.push(`${l} missing`);
    } else if (!existsSync(real) || realpathSync(f) !== realpathSync(real)) {
      errors.push(`${l} must resolve to ${SKILL_REAL}`);
    }
  }
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[2] ?? '.');
  const errors = checkRepo(root);
  if (errors.length > 0) {
    console.error(errors.map((e) => `workboard-check: ${e}`).join('\n'));
    process.exit(1);
  }
  console.log('workboard-check: ok');
}
```

- [ ] **Step 4: Rodar os testes e ver passar**

Run: `node --test scripts/workboard-check.test.mjs`
Expected: todos os testes PASS (21), 0 falhas.

- [ ] **Step 5: Criar `WORKBOARD.md`**

```markdown
# Workboard

Última atualização: 2026-10-10

Fonte única de quem desenvolve o quê. Protocolo completo: seção 15.3 do spec (`docs/superpowers/specs/2026-10-10-whatsapp-chatbot-poc-design.md`) e skill `workboard-protocol`.

| Workstream | Caminho | Status | Dono | Branch | Iniciado | Atualizado | Notas |
|---|---|---|---|---|---|---|---|
| protocol | packages/protocol | not_started | - | - | - | - | |
| resilience | packages/resilience | not_started | - | - | - | - | |
| svc-cotacao | apps/svc-cotacao | not_started | - | - | - | - | Outro agente; contrato em docs/superpowers/specs/2026-10-10-internal-services-contracts.md |
| svc-apolice | apps/svc-apolice | not_started | - | - | - | - | Outro agente; mesmo contrato |
| svc-sinistro | apps/svc-sinistro | not_started | - | - | - | - | Outro agente; mesmo contrato |
| chatbot | apps/chatbot | not_started | - | - | - | - | |
| gateway | apps/gateway | not_started | - | - | - | - | |
| web-chat | apps/web/src/chat, apps/web/src/renderers, apps/web/src/transport | not_started | - | - | - | - | |
| web-flows | apps/web/src/flows | not_started | - | - | - | - | |
```

- [ ] **Step 6: Criar `AGENTS.md` e os apontadores**

`AGENTS.md`:
```markdown
# Regras para agentes e pessoas

Vale para qualquer chatbot, agente de código ou pessoa que trabalhe neste repositório (claude, codex, cursor, antigravity, copilot, gemini e outros). Fonte: seção 15.3 do spec `docs/superpowers/specs/2026-10-10-whatsapp-chatbot-poc-design.md`.

1. Leia o `WORKBOARD.md` antes de tocar no código (`git pull` antes, se houver remoto).
2. Reivindique uma linha `not_started` em um commit próprio (`chore(workboard): claim <workstream>`): `Status` `in_progress`, `Dono`, `Branch`, `Iniciado`, `Atualizado`. Só então escreva código.
3. Um dono por caminho: edite apenas os arquivos do seu `Caminho`. Para mudar arquivo de outra frente, peça ao dono ou registre em `Notas` da linha dele.
4. Trabalhe em branch própria, de preferência em um `git worktree`.
5. Um único repositório git, na raiz. Nunca rode `git init` dentro de `apps/*` ou `packages/*`.
6. Atualize o `CHECKLIST.md` do serviço no mesmo commit que conclui cada item. Marque `[x]` só com código, testes passando e commit feito.
7. Marque a linha como `done` apenas com o `CHECKLIST.md` completo e os testes passando.
8. Reivindicação sem atualização há mais de 24 h pode ser retomada; registre em `Notas` de quem era e o motivo.
9. Rode `node scripts/workboard-check.mjs` antes de cada commit que altere o `WORKBOARD.md`.

Regras de código (seção 14 do spec): arquitetura hexagonal `domain` / `application` / `infra` / `main.ts` nos serviços, com dependências só em `infra → application → domain`; validação Zod nas bordas; erros esperados como valores (Result); commits convencionais.
```

`CLAUDE.md`:
```markdown
Siga as regras de `AGENTS.md` (fonte única) e use a skill `workboard-protocol` antes de iniciar, continuar ou concluir qualquer tarefa neste repositório.
```

`GEMINI.md`:
```markdown
Siga as regras de `AGENTS.md` (fonte única) e a skill `workboard-protocol` antes de iniciar, continuar ou concluir qualquer tarefa neste repositório.
```

`.cursor/rules/workboard.mdc`:
```markdown
---
description: Protocolo de trabalho entre agentes (WORKBOARD)
alwaysApply: true
---

Siga as regras de `AGENTS.md` (fonte única) antes de editar qualquer arquivo deste repositório: leia o `WORKBOARD.md` e reivindique uma linha.
```

`.github/copilot-instructions.md`:
```markdown
Siga as regras de `AGENTS.md` (fonte única) antes de editar qualquer arquivo deste repositório: leia o `WORKBOARD.md` e reivindique uma linha.
```

- [ ] **Step 7: Rodar a validação no repositório real**

Run: `node scripts/workboard-check.mjs`
Expected: `workboard-check: ok` e código de saída 0.

Run: `pnpm lint`
Expected: sem erros (o teste e o script passam no ESLint). Se houver `no-unused-vars`, remova o import não usado e rode de novo.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: add workboard control, agent rules and workboard-check script"
```

---

### Task 3: Pacote `@seguradora/protocol`

**Files:**
- Create: `packages/protocol/src/{limits,result,payloads,client-payloads,events,index}.ts`
- Test: `packages/protocol/src/events.test.ts`, `packages/protocol/src/client-events.test.ts`

**Interfaces:**
- Produces:
  - `LIMITS`, `ERROR_CODES`, `type ErrorCode` (de `limits.ts`)
  - `type Result<T, E>`, `ok(value)`, `err(error)` (de `result.ts`)
  - `ServerEventSchema`, `type ServerEvent`, `parseServerEvent(input: unknown): Result<ServerEvent, ZodError>`
  - `ClientEventSchema`, `type ClientEvent`, `parseClientEvent(input: unknown): Result<ClientEvent, ZodError>`
  - Tipos de evento servidor: `message.text`, `message.voice`, `message.code`, `message.location`, `message.template`, `message.carousel`, `message.quick_replies`, `message.flow`, `status.typing`, `status.delivered`, `status.read`, `error`
  - Tipos de evento cliente: `user.text`, `user.voice`, `user.quick_reply`, `user.flow_submit`, `user.flow_data_exchange`, `user.typing`, `user.ack`

- [ ] **Step 1: Reivindicar a frente `protocol`**

No `WORKBOARD.md`, edite a linha `protocol`: `Status` `in_progress`; `Dono` o nome da ferramenta que executa (`claude`, `codex`, `cursor` ou `antigravity`); `Branch` a branch atual; `Iniciado` e `Atualizado` com a data de hoje (`YYYY-MM-DD`).

Run: `node scripts/workboard-check.mjs`
Expected: `workboard-check: ok`

```bash
git add WORKBOARD.md
git commit -m "chore(workboard): claim protocol"
```

- [ ] **Step 2: Escrever os testes dos eventos do servidor (falham)**

`packages/protocol/src/events.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { LIMITS, parseServerEvent } from './index';

const base = {
  v: 1,
  id: '0192f4c8-7b1a-7c3e-9a55-3f2d1e0b8a41',
  seq: 1,
  sessionId: 'sess-1',
  correlationId: 'corr-1',
  ts: '2026-10-10T12:00:00.000Z',
};

const button = { type: 'quick_reply', id: 'b1', title: 'Sim' };

const fixtures: Record<string, unknown> = {
  'message.text': { text: 'Olá!' },
  'message.voice': { mediaUrl: 'https://exemplo.invalid/a.ogg', durationMs: 3200 },
  'message.code': { language: 'ts', code: 'const a = 1;' },
  'message.location': { latitude: -23.55, longitude: -46.63, name: 'Sé' },
  'message.template': { body: 'Corpo', buttons: [button] },
  'message.carousel': {
    cards: [
      { mediaUrl: 'https://exemplo.invalid/1.jpg', mediaType: 'image', title: 'Um', buttons: [] },
      { mediaUrl: 'https://exemplo.invalid/2.jpg', mediaType: 'image', title: 'Dois', buttons: [] },
    ],
  },
  'message.quick_replies': { text: 'Escolha', options: [{ id: 'a', title: 'A' }] },
  'message.flow': {
    flowId: 'f1',
    body: 'Preencha',
    ctaLabel: 'Abrir',
    flowJson: { version: '7.1', screens: [] },
  },
  'status.typing': { state: 'start' },
  'status.delivered': { messageId: 'm1' },
  'status.read': { messageId: 'm1' },
  error: { code: 'rate_limited', message: 'Muitas requisições' },
};

const event = (type: string, payload: unknown, extra: object = {}) => ({
  ...base,
  type,
  payload,
  ...extra,
});

describe('parseServerEvent', () => {
  it.each(Object.entries(fixtures))('accepts %s', (type, payload) => {
    const r = parseServerEvent(event(type, payload));
    expect(r.ok).toBe(true);
  });

  it('returns the typed event on success', () => {
    const r = parseServerEvent(event('message.text', { text: 'Olá!' }));
    expect(r.ok && r.value.type).toBe('message.text');
  });

  it('rejects an unknown type', () => {
    expect(parseServerEvent(event('message.hologram', {})).ok).toBe(false);
  });

  it('rejects a missing seq', () => {
    const noSeq = event('message.text', { text: 'oi' }) as Record<string, unknown>;
    delete noSeq.seq;
    expect(parseServerEvent(noSeq).ok).toBe(false);
  });

  it.each([-1, 1.5])('rejects an invalid seq (%s)', (seq) => {
    expect(parseServerEvent(event('message.text', { text: 'oi' }, { seq })).ok).toBe(false);
  });

  it('rejects a wrong protocol version', () => {
    expect(parseServerEvent(event('message.text', { text: 'oi' }, { v: 2 })).ok).toBe(false);
  });

  it('rejects a non-uuid id', () => {
    expect(parseServerEvent(event('message.text', { text: 'oi' }, { id: 'abc' })).ok).toBe(false);
  });

  it('rejects text above the limit', () => {
    const text = 'a'.repeat(LIMITS.maxTextLength + 1);
    expect(parseServerEvent(event('message.text', { text })).ok).toBe(false);
  });

  it('rejects more than 3 quick reply options', () => {
    const options = ['a', 'b', 'c', 'd'].map((id) => ({ id, title: id }));
    expect(parseServerEvent(event('message.quick_replies', { text: 'x', options })).ok).toBe(false);
  });

  it('rejects a quick reply title above 20 characters', () => {
    const options = [{ id: 'a', title: 'x'.repeat(21) }];
    expect(parseServerEvent(event('message.quick_replies', { text: 'x', options })).ok).toBe(false);
  });

  it('rejects a carousel with a single card', () => {
    const cards = [
      { mediaUrl: 'https://exemplo.invalid/1.jpg', mediaType: 'image', title: 'Um', buttons: [] },
    ];
    expect(parseServerEvent(event('message.carousel', { cards })).ok).toBe(false);
  });

  it('rejects an out of range latitude', () => {
    const payload = { latitude: 91, longitude: 0 };
    expect(parseServerEvent(event('message.location', payload)).ok).toBe(false);
  });

  it('rejects an unknown error code', () => {
    const payload = { code: 'boom', message: 'x' };
    expect(parseServerEvent(event('error', payload)).ok).toBe(false);
  });

  it('returns a ZodError on failure', () => {
    const r = parseServerEvent({});
    expect(!r.ok && r.error.issues.length > 0).toBe(true);
  });
});
```

- [ ] **Step 3: Escrever os testes dos eventos do cliente (falham)**

`packages/protocol/src/client-events.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { LIMITS, parseClientEvent } from './index';

const base = {
  v: 1,
  id: '0192f4c8-7b1a-7c3e-9a55-3f2d1e0b8a42',
  sessionId: 'sess-1',
  correlationId: 'corr-1',
  ts: '2026-10-10T12:00:00.000Z',
};

const event = (type: string, payload: unknown) => ({ ...base, type, payload });

const fixtures: Record<string, unknown> = {
  'user.text': { text: 'Olá' },
  'user.voice': { mediaId: 'media-1', durationMs: 2000 },
  'user.quick_reply': { optionId: 'a', replyToId: '0192f4c8-7b1a-7c3e-9a55-3f2d1e0b8a41' },
  'user.flow_submit': { flowId: 'f1', data: { nome: 'Maria' } },
  'user.flow_data_exchange': { flowId: 'f1', screen: 'COTACAO', action: 'data_exchange', data: {} },
  'user.typing': { state: 'stop' },
  'user.ack': { lastSeq: 7 },
};

describe('parseClientEvent', () => {
  it.each(Object.entries(fixtures))('accepts %s', (type, payload) => {
    expect(parseClientEvent(event(type, payload)).ok).toBe(true);
  });

  it('trims the text of user.text', () => {
    const r = parseClientEvent(event('user.text', { text: '  oi  ' }));
    expect(r.ok && r.value.type === 'user.text' && r.value.payload.text).toBe('oi');
  });

  it('rejects whitespace only text', () => {
    expect(parseClientEvent(event('user.text', { text: '   \n ' })).ok).toBe(false);
  });

  it('rejects an empty text', () => {
    expect(parseClientEvent(event('user.text', { text: '' })).ok).toBe(false);
  });

  it('rejects text above the limit', () => {
    const text = 'a'.repeat(LIMITS.maxTextLength + 1);
    expect(parseClientEvent(event('user.text', { text })).ok).toBe(false);
  });

  it('rejects extra fields in the payload', () => {
    expect(parseClientEvent(event('user.text', { text: 'oi', admin: true })).ok).toBe(false);
  });

  it('rejects a negative ack', () => {
    expect(parseClientEvent(event('user.ack', { lastSeq: -1 })).ok).toBe(false);
  });

  it('rejects an unknown type', () => {
    expect(parseClientEvent(event('user.teleport', {})).ok).toBe(false);
  });

  it('does not accept server only types', () => {
    expect(parseClientEvent(event('message.text', { text: 'oi' })).ok).toBe(false);
  });
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `pnpm --filter @seguradora/protocol test`
Expected: FAIL, com erro de resolução de `./index`.

- [ ] **Step 5: Implementar `limits.ts` e `result.ts`**

`packages/protocol/src/limits.ts`:
```ts
export const LIMITS = {
  maxTextLength: 4096,
  maxCodeLength: 8192,
  maxQuickReplyOptions: 3,
  maxQuickReplyTitle: 20,
  maxButtonsPerMessage: 3,
  maxButtonsPerCard: 2,
  minCarouselCards: 2,
  maxCarouselCards: 10,
} as const;

export const ERROR_CODES = [
  'rate_limited',
  'invalid_schema',
  'upstream_unavailable',
  'unauthorized',
  'payload_too_large',
  'internal_error',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
```

`packages/protocol/src/result.ts`:
```ts
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
```

- [ ] **Step 6: Implementar os payloads do servidor**

`packages/protocol/src/payloads.ts`:
```ts
import { z } from 'zod';
import { ERROR_CODES, LIMITS } from './limits';

const buttonTitle = z.string().min(1).max(LIMITS.maxQuickReplyTitle);

export const ButtonSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('quick_reply'), id: z.string().min(1), title: buttonTitle }),
  z.object({ type: z.literal('url'), title: buttonTitle, url: z.string().url() }),
  z.object({ type: z.literal('phone'), title: buttonTitle, phone: z.string().min(3) }),
]);

export const TextPayload = z.object({ text: z.string().min(1).max(LIMITS.maxTextLength) });

export const VoicePayload = z.object({
  mediaUrl: z.string().url(),
  durationMs: z.number().int().positive(),
  transcript: z.string().optional(),
});

export const CodePayload = z.object({
  language: z.string().min(1).optional(),
  code: z.string().min(1).max(LIMITS.maxCodeLength),
});

export const LocationPayload = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  name: z.string().optional(),
  address: z.string().optional(),
});

export const TemplatePayload = z.object({
  header: z.string().max(60).optional(),
  body: z.string().min(1).max(1024),
  footer: z.string().max(60).optional(),
  buttons: z.array(ButtonSchema).max(LIMITS.maxButtonsPerMessage),
});

export const CarouselCardSchema = z.object({
  mediaUrl: z.string().url(),
  mediaType: z.enum(['image', 'video']),
  title: z.string().min(1).max(60),
  body: z.string().max(160).optional(),
  buttons: z.array(ButtonSchema).max(LIMITS.maxButtonsPerCard),
});

export const CarouselPayload = z.object({
  cards: z.array(CarouselCardSchema).min(LIMITS.minCarouselCards).max(LIMITS.maxCarouselCards),
});

export const QuickRepliesPayload = z.object({
  text: z.string().min(1).max(LIMITS.maxTextLength),
  options: z
    .array(z.object({ id: z.string().min(1), title: buttonTitle }))
    .min(1)
    .max(LIMITS.maxQuickReplyOptions),
});

// flowJson is a generic record until Plan 5 refines it with the Flow JSON schema.
export const FlowPayload = z.object({
  flowId: z.string().min(1),
  header: z.string().max(60).optional(),
  body: z.string().min(1).max(1024),
  footer: z.string().max(60).optional(),
  ctaLabel: z.string().min(1).max(20),
  flowJson: z.record(z.string(), z.unknown()),
});

export const TypingPayload = z.object({ state: z.enum(['start', 'stop']) });
export const DeliveredPayload = z.object({ messageId: z.string().min(1) });
export const ReadPayload = z.object({ messageId: z.string().min(1) });
export const ErrorPayload = z.object({
  code: z.enum(ERROR_CODES),
  message: z.string().min(1),
});
```

- [ ] **Step 7: Implementar os payloads do cliente**

`packages/protocol/src/client-payloads.ts`:
```ts
import { z } from 'zod';
import { LIMITS } from './limits';

// Client payloads are strict: unknown fields are rejected, never silently dropped.
export const UserTextPayload = z
  .object({ text: z.string().trim().min(1).max(LIMITS.maxTextLength) })
  .strict();

export const UserVoicePayload = z
  .object({ mediaId: z.string().min(1), durationMs: z.number().int().positive() })
  .strict();

export const UserQuickReplyPayload = z
  .object({ optionId: z.string().min(1), replyToId: z.string().min(1) })
  .strict();

export const UserFlowSubmitPayload = z
  .object({ flowId: z.string().min(1), data: z.record(z.string(), z.unknown()) })
  .strict();

export const UserFlowDataExchangePayload = z
  .object({
    flowId: z.string().min(1),
    screen: z.string().min(1),
    action: z.string().min(1),
    data: z.record(z.string(), z.unknown()),
  })
  .strict();

export const UserTypingPayload = z.object({ state: z.enum(['start', 'stop']) }).strict();

export const UserAckPayload = z
  .object({ lastSeq: z.number().int().nonnegative() })
  .strict();
```

- [ ] **Step 8: Implementar `events.ts` e `index.ts`**

`packages/protocol/src/events.ts`:
```ts
import { z } from 'zod';
import { err, ok, type Result } from './result';
import {
  CarouselPayload,
  CodePayload,
  DeliveredPayload,
  ErrorPayload,
  FlowPayload,
  LocationPayload,
  QuickRepliesPayload,
  ReadPayload,
  TemplatePayload,
  TextPayload,
  TypingPayload,
  VoicePayload,
} from './payloads';
import {
  UserAckPayload,
  UserFlowDataExchangePayload,
  UserFlowSubmitPayload,
  UserQuickReplyPayload,
  UserTextPayload,
  UserTypingPayload,
  UserVoicePayload,
} from './client-payloads';

const common = {
  v: z.literal(1),
  id: z.string().uuid(),
  sessionId: z.string().min(1),
  correlationId: z.string().min(1),
  ts: z.string().datetime(),
};

const serverBase = z.object({ ...common, seq: z.number().int().nonnegative() });
const clientBase = z.object(common);

const server = <T extends string, P extends z.ZodTypeAny>(type: T, payload: P) =>
  serverBase.extend({ type: z.literal(type), payload });

const client = <T extends string, P extends z.ZodTypeAny>(type: T, payload: P) =>
  clientBase.extend({ type: z.literal(type), payload });

export const ServerEventSchema = z.discriminatedUnion('type', [
  server('message.text', TextPayload),
  server('message.voice', VoicePayload),
  server('message.code', CodePayload),
  server('message.location', LocationPayload),
  server('message.template', TemplatePayload),
  server('message.carousel', CarouselPayload),
  server('message.quick_replies', QuickRepliesPayload),
  server('message.flow', FlowPayload),
  server('status.typing', TypingPayload),
  server('status.delivered', DeliveredPayload),
  server('status.read', ReadPayload),
  server('error', ErrorPayload),
]);

export const ClientEventSchema = z.discriminatedUnion('type', [
  client('user.text', UserTextPayload),
  client('user.voice', UserVoicePayload),
  client('user.quick_reply', UserQuickReplyPayload),
  client('user.flow_submit', UserFlowSubmitPayload),
  client('user.flow_data_exchange', UserFlowDataExchangePayload),
  client('user.typing', UserTypingPayload),
  client('user.ack', UserAckPayload),
]);

export type ServerEvent = z.infer<typeof ServerEventSchema>;
export type ClientEvent = z.infer<typeof ClientEventSchema>;

export function parseServerEvent(input: unknown): Result<ServerEvent, z.ZodError> {
  const r = ServerEventSchema.safeParse(input);
  return r.success ? ok(r.data) : err(r.error);
}

export function parseClientEvent(input: unknown): Result<ClientEvent, z.ZodError> {
  const r = ClientEventSchema.safeParse(input);
  return r.success ? ok(r.data) : err(r.error);
}
```

`packages/protocol/src/index.ts`:
```ts
export * from './limits';
export * from './result';
export * from './payloads';
export * from './client-payloads';
export * from './events';
```

- [ ] **Step 9: Rodar os testes e ver passar**

Run: `pnpm --filter @seguradora/protocol test`
Expected: PASS em `events.test.ts` e `client-events.test.ts`, 0 falhas.

Run: `pnpm --filter @seguradora/protocol typecheck && pnpm lint`
Expected: sem erros.

- [ ] **Step 10: Atualizar o CHECKLIST e marcar a frente como `done`**

Em `packages/protocol/CHECKLIST.md`, marque `[x]` em todos os itens de Estrutura e Qualidade e nos dois primeiros itens e em `parseServerEvent e parseClientEvent` de Funcionalidades. Deixe `[ ]` o item "Campo flowJson refinado pelo schema de Flow JSON (Plano 5)". Atualize a data.

No `WORKBOARD.md`, na linha `protocol`: `Status` `done` (mantenha `Dono`), `Atualizado` com a data de hoje, `Notas`: `flowJson refinado no Plano 5`.

Run: `node scripts/workboard-check.mjs`
Expected: `workboard-check: ok`

- [ ] **Step 11: Commit**

```bash
git add packages/protocol WORKBOARD.md
git commit -m "feat(protocol): add Zod schemas and parsers for server and client events"
```

---

### Task 4: Pacote `@seguradora/resilience`

**Files:**
- Create: `packages/resilience/src/{timeout,retry,circuit-breaker,bulkhead,policy,index}.ts`
- Test: `packages/resilience/src/{timeout,retry,circuit-breaker,bulkhead,policy}.test.ts`

**Interfaces:**
- Produces:
  - `class TimeoutError extends Error { ms: number }`; `withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T>`
  - `interface RetryOptions { retries: number; baseDelayMs: number; maxDelayMs: number; shouldRetry?: (err: unknown, attempt: number) => boolean; sleep?: (ms: number) => Promise<void>; random?: () => number }`; `retry<T>(fn: (attempt: number) => Promise<T>, o: RetryOptions): Promise<T>`
  - `class CircuitOpenError extends Error`; `type BreakerState = 'closed' | 'open' | 'half_open'`; `interface BreakerOptions { failureThreshold: number; resetTimeoutMs: number; now?: () => number; isFailure?: (err: unknown) => boolean }`; `class CircuitBreaker { constructor(o: BreakerOptions); get state(): BreakerState; execute<T>(fn: () => Promise<T>): Promise<T> }`
  - `class BulkheadFullError extends Error`; `class Bulkhead { constructor(o: { maxConcurrent: number; maxQueue: number }); execute<T>(fn: () => Promise<T>): Promise<T> }`
  - `interface PolicyOptions { timeoutMs: number; retry: RetryOptions; breaker: CircuitBreaker; bulkhead: Bulkhead }`; `createPolicy(o: PolicyOptions): <T>(fn: (signal: AbortSignal) => Promise<T>) => Promise<T>`

- [ ] **Step 1: Reivindicar a frente `resilience`**

No `WORKBOARD.md`, edite a linha `resilience`: `Status` `in_progress`; `Dono` o nome da ferramenta que executa; `Branch`; `Iniciado` e `Atualizado` com a data de hoje.

Run: `node scripts/workboard-check.mjs`
Expected: `workboard-check: ok`

```bash
git add WORKBOARD.md
git commit -m "chore(workboard): claim resilience"
```

- [ ] **Step 2: Escrever os testes de `withTimeout` e `retry` (falham)**

`packages/resilience/src/timeout.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { TimeoutError, withTimeout } from './timeout';

describe('withTimeout', () => {
  it('returns the value when the function finishes in time', async () => {
    await expect(withTimeout(async () => 42, 100)).resolves.toBe(42);
  });

  it('rejects with TimeoutError when the function is too slow', async () => {
    const never = () => new Promise<never>(() => {});
    await expect(withTimeout(never, 20)).rejects.toBeInstanceOf(TimeoutError);
  });

  it('aborts the signal on timeout', async () => {
    let captured: AbortSignal | undefined;
    const fn = (signal: AbortSignal) => {
      captured = signal;
      return new Promise<never>(() => {});
    };
    await expect(withTimeout(fn, 20)).rejects.toBeInstanceOf(TimeoutError);
    expect(captured?.aborted).toBe(true);
  });

  it('propagates the error of the function', async () => {
    await expect(
      withTimeout(async () => {
        throw new Error('boom');
      }, 100),
    ).rejects.toThrow('boom');
  });

  it('treats a synchronous throw as a rejection', async () => {
    const fn = (() => {
      throw new Error('sync boom');
    }) as unknown as () => Promise<never>;
    await expect(withTimeout(fn, 100)).rejects.toThrow('sync boom');
  });
});
```

`packages/resilience/src/retry.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { retry } from './retry';

const noSleep = async () => {};

describe('retry', () => {
  it('returns the first success without retrying', async () => {
    let calls = 0;
    const r = await retry(async () => ++calls, {
      retries: 3,
      baseDelayMs: 10,
      maxDelayMs: 100,
      sleep: noSleep,
    });
    expect(r).toBe(1);
    expect(calls).toBe(1);
  });

  it('succeeds after transient failures', async () => {
    let calls = 0;
    const r = await retry(
      async () => {
        calls++;
        if (calls < 3) throw new Error('flaky');
        return 'ok';
      },
      { retries: 3, baseDelayMs: 10, maxDelayMs: 100, sleep: noSleep },
    );
    expect(r).toBe('ok');
    expect(calls).toBe(3);
  });

  it('throws the last error after exhausting retries', async () => {
    let calls = 0;
    await expect(
      retry(
        async () => {
          calls++;
          throw new Error(`fail ${calls}`);
        },
        { retries: 2, baseDelayMs: 10, maxDelayMs: 100, sleep: noSleep },
      ),
    ).rejects.toThrow('fail 3');
    expect(calls).toBe(3);
  });

  it('calls the function exactly once when retries is 0', async () => {
    let calls = 0;
    await expect(
      retry(
        async () => {
          calls++;
          throw new Error('x');
        },
        { retries: 0, baseDelayMs: 10, maxDelayMs: 100, sleep: noSleep },
      ),
    ).rejects.toThrow('x');
    expect(calls).toBe(1);
  });

  it('does not retry when shouldRetry returns false', async () => {
    let calls = 0;
    await expect(
      retry(
        async () => {
          calls++;
          throw new Error('fatal');
        },
        {
          retries: 5,
          baseDelayMs: 10,
          maxDelayMs: 100,
          sleep: noSleep,
          shouldRetry: () => false,
        },
      ),
    ).rejects.toThrow('fatal');
    expect(calls).toBe(1);
  });

  it('uses exponential backoff capped at maxDelayMs with full jitter', async () => {
    const delays: number[] = [];
    await expect(
      retry(
        async () => {
          throw new Error('x');
        },
        {
          retries: 3,
          baseDelayMs: 100,
          maxDelayMs: 250,
          sleep: async (ms) => {
            delays.push(ms);
          },
          random: () => 1,
        },
      ),
    ).rejects.toThrow('x');
    expect(delays).toEqual([100, 200, 250]);
  });

  it('applies jitter between 0 and the cap', async () => {
    const delays: number[] = [];
    await expect(
      retry(
        async () => {
          throw new Error('x');
        },
        {
          retries: 1,
          baseDelayMs: 100,
          maxDelayMs: 1000,
          sleep: async (ms) => {
            delays.push(ms);
          },
          random: () => 0.5,
        },
      ),
    ).rejects.toThrow('x');
    expect(delays).toEqual([50]);
  });

  it('passes the attempt number to the function', async () => {
    const seen: number[] = [];
    await expect(
      retry(
        async (attempt) => {
          seen.push(attempt);
          throw new Error('x');
        },
        { retries: 2, baseDelayMs: 1, maxDelayMs: 1, sleep: noSleep },
      ),
    ).rejects.toThrow('x');
    expect(seen).toEqual([0, 1, 2]);
  });

  it('treats a synchronous throw as a failure', async () => {
    let calls = 0;
    const fn = (() => {
      calls++;
      throw new Error('sync boom');
    }) as unknown as () => Promise<never>;
    await expect(
      retry(fn, { retries: 1, baseDelayMs: 1, maxDelayMs: 1, sleep: noSleep }),
    ).rejects.toThrow('sync boom');
    expect(calls).toBe(2);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm --filter @seguradora/resilience test`
Expected: FAIL, com erro de resolução de `./timeout` e `./retry`.

- [ ] **Step 4: Implementar `withTimeout` e `retry`**

`packages/resilience/src/timeout.ts`:
```ts
export class TimeoutError extends Error {
  constructor(public readonly ms: number) {
    super(`Timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  ms: number,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new TimeoutError(ms));
    }, ms);
  });
  try {
    return await Promise.race([fn(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
```

`packages/resilience/src/retry.ts`:
```ts
export interface RetryOptions {
  retries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  shouldRetry?: (err: unknown, attempt: number) => boolean;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function retry<T>(fn: (attempt: number) => Promise<T>, o: RetryOptions): Promise<T> {
  const sleep = o.sleep ?? defaultSleep;
  const random = o.random ?? Math.random;
  const shouldRetry = o.shouldRetry ?? (() => true);

  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      if (attempt >= o.retries || !shouldRetry(error, attempt)) throw error;
      const cap = Math.min(o.maxDelayMs, o.baseDelayMs * 2 ** attempt);
      await sleep(Math.floor(random() * cap));
    }
  }
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @seguradora/resilience test`
Expected: PASS em `timeout.test.ts` e `retry.test.ts`.

- [ ] **Step 6: Escrever os testes de `CircuitBreaker` e `Bulkhead` (falham)**

`packages/resilience/src/circuit-breaker.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { CircuitBreaker, CircuitOpenError } from './circuit-breaker';

const fail = async () => {
  throw new Error('down');
};
const succeed = async () => 'ok';

const make = (overrides: { failureThreshold?: number; isFailure?: (e: unknown) => boolean } = {}) => {
  const clock = { t: 0 };
  const breaker = new CircuitBreaker({
    failureThreshold: overrides.failureThreshold ?? 2,
    resetTimeoutMs: 1000,
    now: () => clock.t,
    ...(overrides.isFailure ? { isFailure: overrides.isFailure } : {}),
  });
  return { breaker, clock };
};

describe('CircuitBreaker', () => {
  it('starts closed and passes calls through', async () => {
    const { breaker } = make();
    expect(breaker.state).toBe('closed');
    await expect(breaker.execute(succeed)).resolves.toBe('ok');
  });

  it('opens after the failure threshold and rejects without calling the function', async () => {
    const { breaker } = make();
    await expect(breaker.execute(fail)).rejects.toThrow('down');
    await expect(breaker.execute(fail)).rejects.toThrow('down');
    expect(breaker.state).toBe('open');

    let called = false;
    await expect(
      breaker.execute(async () => {
        called = true;
      }),
    ).rejects.toBeInstanceOf(CircuitOpenError);
    expect(called).toBe(false);
  });

  it('opens on the first failure when the threshold is 1', async () => {
    const { breaker } = make({ failureThreshold: 1 });
    await expect(breaker.execute(fail)).rejects.toThrow('down');
    expect(breaker.state).toBe('open');
  });

  it('resets the failure count after a success', async () => {
    const { breaker } = make();
    await expect(breaker.execute(fail)).rejects.toThrow('down');
    await breaker.execute(succeed);
    await expect(breaker.execute(fail)).rejects.toThrow('down');
    expect(breaker.state).toBe('closed');
  });

  it('becomes half open after the reset timeout and closes on a successful probe', async () => {
    const { breaker, clock } = make();
    await expect(breaker.execute(fail)).rejects.toThrow('down');
    await expect(breaker.execute(fail)).rejects.toThrow('down');
    clock.t = 1000;
    expect(breaker.state).toBe('half_open');
    await expect(breaker.execute(succeed)).resolves.toBe('ok');
    expect(breaker.state).toBe('closed');
  });

  it('reopens when the probe fails', async () => {
    const { breaker, clock } = make();
    await expect(breaker.execute(fail)).rejects.toThrow('down');
    await expect(breaker.execute(fail)).rejects.toThrow('down');
    clock.t = 1000;
    await expect(breaker.execute(fail)).rejects.toThrow('down');
    expect(breaker.state).toBe('open');
    clock.t = 1500;
    expect(breaker.state).toBe('open');
    clock.t = 2000;
    expect(breaker.state).toBe('half_open');
  });

  it('allows only one probe at a time while half open', async () => {
    const { breaker, clock } = make();
    await expect(breaker.execute(fail)).rejects.toThrow('down');
    await expect(breaker.execute(fail)).rejects.toThrow('down');
    clock.t = 1000;

    let release: (v: string) => void = () => {};
    const slow = () => new Promise<string>((resolve) => (release = resolve));
    const probe = breaker.execute(slow);
    await expect(breaker.execute(succeed)).rejects.toBeInstanceOf(CircuitOpenError);
    release('done');
    await expect(probe).resolves.toBe('done');
    expect(breaker.state).toBe('closed');
  });

  it('does not count errors that isFailure rejects', async () => {
    const { breaker } = make({
      failureThreshold: 1,
      isFailure: (e) => !(e instanceof RangeError),
    });
    await expect(
      breaker.execute(async () => {
        throw new RangeError('not found');
      }),
    ).rejects.toBeInstanceOf(RangeError);
    expect(breaker.state).toBe('closed');
  });
});
```

`packages/resilience/src/bulkhead.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { Bulkhead, BulkheadFullError } from './bulkhead';

const deferred = <T>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

describe('Bulkhead', () => {
  it('runs calls up to maxConcurrent in parallel', async () => {
    const bulkhead = new Bulkhead({ maxConcurrent: 2, maxQueue: 0 });
    const a = deferred<string>();
    const b = deferred<string>();
    const pa = bulkhead.execute(() => a.promise);
    const pb = bulkhead.execute(() => b.promise);
    a.resolve('a');
    b.resolve('b');
    await expect(Promise.all([pa, pb])).resolves.toEqual(['a', 'b']);
  });

  it('queues calls above maxConcurrent and runs them when a slot frees', async () => {
    const bulkhead = new Bulkhead({ maxConcurrent: 1, maxQueue: 1 });
    const first = deferred<string>();
    const order: string[] = [];
    const p1 = bulkhead.execute(async () => {
      order.push('first-start');
      return first.promise;
    });
    const p2 = bulkhead.execute(async () => {
      order.push('second-start');
      return 'second';
    });
    await Promise.resolve();
    expect(order).toEqual(['first-start']);
    first.resolve('first');
    await expect(p1).resolves.toBe('first');
    await expect(p2).resolves.toBe('second');
    expect(order).toEqual(['first-start', 'second-start']);
  });

  it('rejects with BulkheadFullError when running and queue are full', async () => {
    const bulkhead = new Bulkhead({ maxConcurrent: 1, maxQueue: 1 });
    const gate = deferred<string>();
    const p1 = bulkhead.execute(() => gate.promise);
    const p2 = bulkhead.execute(async () => 'queued');
    await expect(bulkhead.execute(async () => 'x')).rejects.toBeInstanceOf(BulkheadFullError);
    gate.resolve('ok');
    await Promise.all([p1, p2]);
  });

  it('rejects immediately when maxQueue is 0 and all slots are busy', async () => {
    const bulkhead = new Bulkhead({ maxConcurrent: 1, maxQueue: 0 });
    const gate = deferred<string>();
    const p1 = bulkhead.execute(() => gate.promise);
    await expect(bulkhead.execute(async () => 'x')).rejects.toBeInstanceOf(BulkheadFullError);
    gate.resolve('ok');
    await p1;
  });

  it('frees the slot when the function fails', async () => {
    const bulkhead = new Bulkhead({ maxConcurrent: 1, maxQueue: 0 });
    await expect(
      bulkhead.execute(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    await expect(bulkhead.execute(async () => 'after')).resolves.toBe('after');
  });
});
```

- [ ] **Step 7: Rodar e ver falhar**

Run: `pnpm --filter @seguradora/resilience test`
Expected: FAIL, com erro de resolução de `./circuit-breaker` e `./bulkhead`.

- [ ] **Step 8: Implementar `CircuitBreaker` e `Bulkhead`**

`packages/resilience/src/circuit-breaker.ts`:
```ts
export class CircuitOpenError extends Error {
  constructor() {
    super('Circuit breaker is open');
    this.name = 'CircuitOpenError';
  }
}

export type BreakerState = 'closed' | 'open' | 'half_open';

export interface BreakerOptions {
  failureThreshold: number;
  resetTimeoutMs: number;
  now?: () => number;
  isFailure?: (err: unknown) => boolean;
}

export class CircuitBreaker {
  private failures = 0;
  private openedAt = 0;
  private opened = false;
  private probing = false;
  private readonly now: () => number;
  private readonly isFailure: (err: unknown) => boolean;

  constructor(private readonly o: BreakerOptions) {
    this.now = o.now ?? Date.now;
    this.isFailure = o.isFailure ?? (() => true);
  }

  get state(): BreakerState {
    if (!this.opened) return 'closed';
    return this.now() - this.openedAt >= this.o.resetTimeoutMs ? 'half_open' : 'open';
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const state = this.state;
    if (state === 'open') throw new CircuitOpenError();
    if (state === 'half_open') {
      if (this.probing) throw new CircuitOpenError();
      this.probing = true;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      if (this.isFailure(error)) this.onFailure(state === 'half_open');
      else this.onSuccess();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.opened = false;
    this.probing = false;
  }

  private onFailure(wasProbe: boolean): void {
    this.failures++;
    if (wasProbe || this.failures >= this.o.failureThreshold) {
      this.opened = true;
      this.openedAt = this.now();
      this.probing = false;
    }
  }
}
```

`packages/resilience/src/bulkhead.ts`:
```ts
export class BulkheadFullError extends Error {
  constructor() {
    super('Bulkhead is full');
    this.name = 'BulkheadFullError';
  }
}

export class Bulkhead {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly o: { maxConcurrent: number; maxQueue: number }) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active < this.o.maxConcurrent) {
      this.active++;
    } else {
      if (this.queue.length >= this.o.maxQueue) throw new BulkheadFullError();
      // The slot is handed over by the call that finishes, so `active` stays counted.
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }

    try {
      return await fn();
    } finally {
      const next = this.queue.shift();
      if (next) next();
      else this.active--;
    }
  }
}
```

- [ ] **Step 9: Rodar e ver passar**

Run: `pnpm --filter @seguradora/resilience test`
Expected: PASS em `circuit-breaker.test.ts` e `bulkhead.test.ts` (e nos anteriores).

- [ ] **Step 10: Escrever o teste da composição `createPolicy` (falha)**

`packages/resilience/src/policy.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { Bulkhead } from './bulkhead';
import { CircuitBreaker, CircuitOpenError } from './circuit-breaker';
import { createPolicy } from './policy';

const make = (failureThreshold = 2) => {
  const clock = { t: 0 };
  const breaker = new CircuitBreaker({
    failureThreshold,
    resetTimeoutMs: 1000,
    now: () => clock.t,
  });
  const bulkhead = new Bulkhead({ maxConcurrent: 4, maxQueue: 4 });
  const policy = createPolicy({
    timeoutMs: 50,
    retry: { retries: 2, baseDelayMs: 1, maxDelayMs: 1, sleep: async () => {} },
    breaker,
    bulkhead,
  });
  return { policy, breaker };
};

describe('createPolicy', () => {
  it('recovers from transient failures through retry', async () => {
    const { policy } = make();
    let calls = 0;
    const r = await policy(async () => {
      calls++;
      if (calls < 3) throw new Error('flaky');
      return 'ok';
    });
    expect(r).toBe('ok');
    expect(calls).toBe(3);
  });

  it('times out slow calls and counts them as a failure', async () => {
    const { policy, breaker } = make(1);
    const never = () => new Promise<never>(() => {});
    await expect(policy(never)).rejects.toThrow(/Timed out/);
    expect(breaker.state).toBe('open');
  });

  it('does not call the function once the circuit is open and does not retry the open error', async () => {
    const { policy } = make(1);
    await expect(
      policy(async () => {
        throw new Error('down');
      }),
    ).rejects.toThrow('down');

    let calls = 0;
    await expect(
      policy(async () => {
        calls++;
        return 'x';
      }),
    ).rejects.toBeInstanceOf(CircuitOpenError);
    expect(calls).toBe(0);
  });
});
```

- [ ] **Step 11: Rodar e ver falhar**

Run: `pnpm --filter @seguradora/resilience test -- policy`
Expected: FAIL, com erro de resolução de `./policy`.

- [ ] **Step 12: Implementar `createPolicy` e o `index.ts`**

`packages/resilience/src/policy.ts`:
```ts
import type { Bulkhead } from './bulkhead';
import type { CircuitBreaker } from './circuit-breaker';
import { retry, type RetryOptions } from './retry';
import { withTimeout } from './timeout';

export interface PolicyOptions {
  timeoutMs: number;
  retry: RetryOptions;
  breaker: CircuitBreaker;
  bulkhead: Bulkhead;
}

// bulkhead → circuit breaker → retry → timeout → function
export function createPolicy(o: PolicyOptions) {
  return <T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> =>
    o.bulkhead.execute(() =>
      o.breaker.execute(() => retry(() => withTimeout(fn, o.timeoutMs), o.retry)),
    );
}
```

`packages/resilience/src/index.ts`:
```ts
export * from './timeout';
export * from './retry';
export * from './circuit-breaker';
export * from './bulkhead';
export * from './policy';
```

- [ ] **Step 13: Rodar tudo e verificar**

Run: `pnpm --filter @seguradora/resilience test`
Expected: PASS em todos os 5 arquivos, 0 falhas.

Run: `pnpm --filter @seguradora/resilience typecheck && pnpm lint`
Expected: sem erros.

- [ ] **Step 14: Atualizar o CHECKLIST e marcar a frente como `done`**

Em `packages/resilience/CHECKLIST.md`, marque `[x]` em todos os itens e atualize a data. No `WORKBOARD.md`, linha `resilience`: `Status` `done` (mantenha `Dono`), `Atualizado` com a data de hoje.

Run: `node scripts/workboard-check.mjs`
Expected: `workboard-check: ok`

- [ ] **Step 15: Commit**

```bash
git add packages/resilience WORKBOARD.md
git commit -m "feat(resilience): add timeout, retry, circuit breaker, bulkhead and policy"
```

---

### Task 5: CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Criar o workflow**

`.github/workflows/ci.yml`:
```yaml
name: ci

on:
  push:
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm check:workboard
```

- [ ] **Step 2: Rodar localmente a mesma sequência**

Run: `pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test && pnpm check:workboard`
Expected: todos os comandos terminam com código 0 (`pnpm test` roda os testes dos dois pacotes e o `node --test` do script).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "chore: add CI workflow"
```

---

## Self-review

**Cobertura do spec**

| Requisito | Tarefa |
|---|---|
| 15.1 `git init` único, estrutura, arquivos de workspace, commit inicial | repositório já existe; Tarefa 1 |
| 15.2 `CHECKLIST.md` por app e pacote, criados com itens em aberto | Tarefa 1, passo 5 |
| 15.3 `WORKBOARD.md`, `AGENTS.md`, apontadores, `workboard-check.mjs` | Tarefa 2 |
| 15.3 validação de apontadores e dos symlinks da skill | Tarefa 2 (`checkRepo`) |
| 3 envelope, tipos servidor→cliente e cliente→servidor, limites, códigos de erro | Tarefa 3 |
| 10 timeout, retry com backoff e jitter, circuit breaker, bulkhead | Tarefa 4 |
| 12 CI | Tarefa 5 |
| 14 Result type | Tarefa 3 (`result.ts`) |

**Fora deste plano, por decisão:** `dependency-cruiser` e Dockerfile/deploy (entram com cada app nos Planos 2 a 5), idempotência e buffer de reenvio (Plano 2), refinamento de `flowJson` (Plano 5), e os três serviços internos (outro agente).

**Desvio do spec:** o `scripts/workboard-check.mjs` nasce na Tarefa 2, depois do commit de scaffold da Tarefa 1, e não no mesmo commit inicial. Nenhum código de aplicação é escrito antes dele, então a intenção do spec (controle antes da implementação) se mantém. A coluna `Caminho` aceita vários caminhos separados por vírgula, porque a frente `web-chat` cobre três pastas.

**Consistência de tipos:** `Row.paths` (array) é usado em `parseWorkboard`, `validateRows` e `overlaps`; `parseServerEvent`/`parseClientEvent` retornam `Result<…, ZodError>` com `ok`/`err` de `result.ts`; `RetryOptions` é a mesma em `retry.ts` e `policy.ts`; `CircuitBreaker.execute` e `Bulkhead.execute` recebem `() => Promise<T>`.

**Pontos que dependem de conferência na execução**
- Uma versão do Zod 3 em que `z.string().uuid()` aceite o UUID v7 dos testes (a regex do Zod 3 aceita qualquer versão). Se o teste de `id` falhar, usar `z.string().min(1)` e registrar em `Pendências` do `CHECKLIST.md`.
- Se algum comando `pnpm` apontar versão incompatível do pnpm ou do Node, ajustar a versão no `ci.yml` (campo `version` do `pnpm/action-setup` e `node-version`) para a que roda localmente.
