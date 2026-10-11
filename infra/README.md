# infra

Deploy do POC (Plano 7). O runbook completo fica em [`docs/deploy.md`](../docs/deploy.md).

## O que tem aqui

- `docker-compose.yml`: o produto inteiro local (`web` → `gateway` → `chatbot` → `fake-services`). Só o `web` é publicado no host (`${WEB_PORT:-8080}`). O `SESSION_SECRET` padrão é só para desenvolvimento.
- `fake-services/`: imagem do fake dos serviços internos (cotação, apólice, sinistro), o mesmo usado nos testes do chatbot (`apps/chatbot/src/test/fake-services.ts`). Roda o TypeScript direto com o type stripping do Node, sem build nem dependências.
- `smoke.mjs`: smoke test de ponta a ponta pela URL pública (Node 22, sem dependências). Sete passos: `web`, `session`, `stream`, `chatbot`, `demo-flow`, `quote`, `replay`. Cada passo imprime `ok <passo>`; uma falha imprime `FAIL <hop>: <motivo>` (hop em `web`, `session`, `sse`, `chatbot`, `services`) e sai com código 1.
- `smoke.test.mjs`: testes unitários do parser SSE e da espera por eventos (rodam no `pnpm test`, sem Docker).

## Rodar localmente

```bash
pnpm compose:up                       # docker compose -f infra/docker-compose.yml up -d --build --wait
pnpm smoke http://localhost:8080      # ou BASE_URL=http://localhost:8080 node infra/smoke.mjs
pnpm compose:down                     # docker compose -f infra/docker-compose.yml down -v
```

Com outra porta: `WEB_PORT=8081 pnpm compose:up` e `pnpm smoke http://localhost:8081` (o `ALLOWED_ORIGIN` do gateway acompanha o `WEB_PORT`).
