# infra

Deploy do POC (Plano 7). O runbook completo, do bootstrap do projeto GCP ao primeiro apply, GitHub, smoke, rollback e destruição, fica em [`docs/deploy.md`](../docs/deploy.md).

## O que tem aqui

- `docker-compose.yml`: o produto inteiro local (`web` → `gateway` → `chatbot` → `fake-services`). Só o `web` é publicado no host (`${WEB_PORT:-8080}`). O `SESSION_SECRET` padrão é só para desenvolvimento.
- `fake-services/`: imagem do fake dos serviços internos (cotação, apólice, sinistro), o mesmo usado nos testes do chatbot (`apps/chatbot/src/test/fake-services.ts`). Roda o TypeScript direto com o type stripping do Node, sem build nem dependências.
- `smoke.mjs`: smoke test de ponta a ponta pela URL pública (Node 22, sem dependências). Sete passos: `web`, `session`, `stream`, `chatbot`, `demo-flow`, `quote`, `replay`. Cada passo imprime `ok <passo>`; uma falha imprime `FAIL <hop>: <motivo>` (hop em `web`, `session`, `sse`, `chatbot`, `services`) e sai com código 1. Cada passo tem um prazo único de 10 s (requisições e espera somadas) e a execução inteira tem um orçamento global de 55 s.
- `smoke.test.mjs`: testes unitários do parser SSE e da espera por eventos (rodam no `pnpm test`, sem Docker).
- `test-nginx.sh` (`pnpm test:infra`, precisa de Docker; fora do `pnpm test`): sobe o compose e roda o smoke; recria o gateway com outro IP (um contêiner descartável ocupa o IP antigo) sem reiniciar o `web` e roda o smoke de novo; confere o config renderizado da imagem web (http/https, porta, nameserver IPv6, falhas claras de `GATEWAY_URL`/`resolv.conf`), os cabeçalhos de `/`, `/assets/` e `/health`, e que `Host`, `Origin`, path e query chegam ao upstream (servidor de eco descartável). Remove tudo o que criou ao sair.
- `lint-workflows.sh` (`pnpm lint:workflows`, precisa de Docker; fora do `pnpm test`): roda o `actionlint` (imagem `rhysd/actionlint:latest`, com shellcheck) em `.github/workflows/*.yml` e as checagens extras de `lint-workflows.mjs`: nenhuma expressão não confiável (`${{ inputs.* }}`, `${{ github.event.* }}`, `${{ github.ref_name }}`, `${{ github.head_ref }}`) dentro de `run:` (passar por `env:`), todo `uses:` fixado em tag major ou SHA, `permissions:` no topo de cada workflow, `id-token: write` só em job com `environment:` (nunca no topo) e presença de `ci.yml` (jobs `verify`, `docker`) e `deploy.yml` (jobs `deploy`, `smoke`). Antes, um autoteste confirma que as checagens e o actionlint falham em workflows ruins num diretório temporário.
- `check-runbook.mjs` (`pnpm check:runbook`; testes em `check-runbook.test.mjs`, no `pnpm test`): confere que o runbook `docs/deploy.md` só cita caminhos do repositório que existem, variáveis do Terraform declaradas em `terraform/variables.tf`, endereços `-target`/`-replace` declarados nos `.tf`, todas as variáveis `vars.*` do `deploy.yml` (e só elas) na tabela de variáveis do repositório, os inputs do `workflow_dispatch` do `deploy.yml`, e as seções obrigatórias.
- `../.github/workflows/`: `ci.yml` (job `verify` e job `docker`, que constrói as quatro imagens sem push, com cache GHA) e `deploy.yml` (manual com `image_tag` opcional ou tag `v*`; recusa construir numa tag que já existe no registro, e o input `deploy_existing_tag` implanta imagens já publicadas sem rebuild, para rollback; job único `deploy` no environment `production` (aprovação antes de qualquer credencial: imagens e depois Terraform) → `smoke`, sem credenciais). Variáveis do repositório listadas no topo do `deploy.yml` e no runbook.
- `terraform/`: Terraform do Cloud Run (APIs, Artifact Registry, VPC para Direct VPC egress, contas de serviço, `SESSION_SECRET` no Secret Manager, os quatro serviços, WIF do GitHub e orçamento opcionais). Nunca foi aplicado daqui; `infra/terraform/validate.sh` valida offline (`fmt`, `init -backend=false`, `validate` e checagens estruturais). Detalhes, contagem esperada no `plan` e outputs em [`terraform/README.md`](terraform/README.md).

## Rodar localmente

```bash
pnpm compose:up                       # docker compose -f infra/docker-compose.yml up -d --build --wait
pnpm smoke http://localhost:8080      # ou BASE_URL=http://localhost:8080 node infra/smoke.mjs
pnpm compose:down                     # docker compose -f infra/docker-compose.yml down -v
```

Com outra porta: `WEB_PORT=8081 pnpm compose:up` e `pnpm smoke http://localhost:8081` (o `ALLOWED_ORIGIN` do gateway acompanha o `WEB_PORT`).
