---
name: monorepo-services
description: Use quando precisar localizar um serviço, entender chamadas entre workspaces ou escolher onde implementar, testar e executar mudanças neste monorepo.
---

# Tour do monorepo

Comece por `WORKBOARD.md`: ele contém os donos e caminhos atuais de **cada workspace e da infraestrutura**. Reivindique a frente pelo protocolo antes de editar; não copie sua tabela de status. O spec geral é `docs/superpowers/specs/2026-10-10-whatsapp-chatbot-poc-design.md`; o contrato web/gateway/chatbot fica em `docs/superpowers/specs/2026-10-10-gateway-chatbot-contract.md` e o dos três serviços internos em `docs/superpowers/specs/2026-10-10-internal-services-contracts.md`.

```text
browser → web/nginx → gateway → chatbot → svc-cotacao
                                      → svc-apolice
                                      → svc-sinistro
```

O navegador usa `/v1` na mesma origem; o gateway entrega SSE ao navegador e recebe NDJSON do chatbot. No compose, um único fake atende os três contratos internos. No Cloud Run são seis serviços independentes; enquanto faltarem Dockerfiles dos serviços internos, cada um recebe sua própria imagem FAKE.

## apps/web

SPA React para chat, renderização de mensagens e Flows, empacotada pelo Vite. A imagem de produção serve o bundle com nginx e encaminha `/v1` ao gateway, sem URLs de aplicação no bundle.

- Chamadas e saúde: Vite dev em 5173 e preview em 4173 (`apps/web/vite.config.ts`); nginx em 8080 por padrão, com `GET /health` (`apps/web/nginx.conf.template`). O healthcheck do compose usa `/`.
- Rodar: `pnpm --filter @seguradora/web dev`; para preview, `pnpm --filter @seguradora/web build` e `pnpm --filter @seguradora/web preview`. Para a imagem e backend completo, use a receita compose abaixo.
- Ambiente: `VITE_DEV_GATEWAY_URL` aponta por padrão a localhost:8080 (`apps/web/.env.example`); `VITE_PREVIEW_GATEWAY_URL` pode substituí-lo no preview (`apps/web/vite.config.ts`). No nginx, `PORT` default 8080 e `GATEWAY_URL` default http://gateway:8080 estão em `apps/web/Dockerfile`; não confunda essas variáveis de runtime com as do Vite.
- Testar: `pnpm --filter @seguradora/web test` e `pnpm --filter @seguradora/web e2e` (Playwright, gateway simulado). Scripts: `apps/web/package.json`; cobertura e pendências: `apps/web/CHECKLIST.md`. Contrato: spec geral e contrato web/gateway/chatbot citados acima.
- Dono: `WORKBOARD.md`, caminho apps/web. Deploy: skill `deploy-service` em `.agents/skills/deploy-service/SKILL.md`, serviço web.

## apps/gateway

API Fastify que gerencia sessões, cookies, fila de turnos, replay e stream SSE. Recebe requisições da web e chama o chatbot; estado em memória pede atenção à escala e afinidade.

- Rotas: `POST /v1/session`, `GET /v1/stream`, `POST /v1/events`, `GET /health` e `GET /ready` em `apps/gateway/src/infra/http/app.ts`. `apps/gateway/src/main.ts` valida configuração antes de escutar; `PORT` default 8080 e `HOST` default 0.0.0.0.
- Rodar: `pnpm --filter @seguradora/gateway build` e `pnpm --filter @seguradora/gateway start`, com ambiente preparado pelo operador; start não carrega o arquivo de exemplo automaticamente. Use compose para a configuração integrada de cookies e origem.
- Ambiente e defaults: consulte `apps/gateway/src/config.ts` e `apps/gateway/.env.example`. `CHATBOT_URL`, `SESSION_SECRET` e `ALLOWED_ORIGIN` são obrigatórias; o segredo curto do exemplo falha de propósito. O schema usa `COOKIE_SECURE=true`, `COOKIE_SAME_SITE=none`, `TRUST_PROXY_HOPS=0`; compose substitui para HTTP local e um proxy; deploy define os saltos no arquivo de configuração de infra. Não copie tabelas de defaults.
- Testar: `pnpm --filter @seguradora/gateway test`; scripts em `apps/gateway/package.json`, pendências em `apps/gateway/CHECKLIST.md`, contrato no spec web/gateway/chatbot citado acima.
- Dono: `WORKBOARD.md`, caminho apps/gateway. Deploy: `deploy-service`, serviço gateway.

## apps/chatbot

Motor de diálogo, catálogo de Flows e jornadas tipadas com armazenamento em memória. Recebe turnos do gateway e consulta cotação, apólice e sinistro através de adapters HTTP com políticas de resiliência.

- Rotas: `POST /v1/chat/events` responde NDJSON; `GET /health` e `GET /ready` em `apps/chatbot/src/infra/http/app.ts`. Inicialização em `apps/chatbot/src/main.ts`; schema usa `PORT=8080` e `HOST=0.0.0.0`, mas o exemplo local usa `PORT=8081` para coexistir com o gateway.
- Rodar: `pnpm --filter @seguradora/chatbot build` e `pnpm --filter @seguradora/chatbot start`, com ambiente previamente preparado; start não lê o exemplo sozinho. No compose todos os contêineres usam 8080 em sua própria rede.
- Ambiente: `COTACAO_URL`, `APOLICE_URL`, `SINISTRO_URL` são obrigatórias; consulte `apps/chatbot/src/config.ts` para defaults de timeout/retries/capacidades e `apps/chatbot/.env.example` para URLs locais nas portas 3101/3102/3103. Compose aponta as três URLs ao mesmo fake em 8080.
- Testar: `pnpm --filter @seguradora/chatbot test`; scripts em `apps/chatbot/package.json`, pendências em `apps/chatbot/CHECKLIST.md`. Contratos: web/gateway/chatbot para os turnos, serviços internos para os adapters; ambos citados acima. JSONs canônicos de Flows: `apps/chatbot/src/domain/flows/`.
- Dono: `WORKBOARD.md`, caminho apps/chatbot. Deploy: `deploy-service`, serviço chatbot.

## apps/svc-cotacao

Frente de outro agente, ainda sem implementação, configuração ou scripts de execução/teste no `apps/svc-cotacao/package.json`. Entregará produtos e cálculo/consulta de cotações para o chatbot, seguindo `docs/superpowers/specs/2026-10-10-internal-services-contracts.md`.

Porta local prevista no contrato: 3101; Cloud Run usa `PORT` e a convenção 8080. `/health` e `/ready` são requisitos futuros, não rotas disponíveis deste workspace. Hoje rode compose para usar o fake de `infra/fake-services/`; seus contratos são exercitados por `pnpm --filter @seguradora/chatbot test` e pelo smoke da pilha. Ambiente e testes do serviço real serão definidos na sua implementação; não invente scripts. Pendências: `apps/svc-cotacao/CHECKLIST.md`; dono: `WORKBOARD.md`, caminho apps/svc-cotacao. Deploy: `deploy-service`, serviço svc-cotacao, com aviso FAKE enquanto faltar Dockerfile.

## apps/svc-apolice

Frente de outro agente, ainda sem implementação, configuração ou scripts de execução/teste no `apps/svc-apolice/package.json`. Entregará consulta e segunda via de apólices para o chatbot, seguindo `docs/superpowers/specs/2026-10-10-internal-services-contracts.md`.

Porta local prevista no contrato: 3102; Cloud Run usa `PORT` e a convenção 8080. `/health` e `/ready` são requisitos futuros. Para execução local use o fake no compose; teste seus contratos com `pnpm --filter @seguradora/chatbot test` e smoke. Ambiente e testes reais aguardam implementação. Pendências: `apps/svc-apolice/CHECKLIST.md`; dono: `WORKBOARD.md`, caminho apps/svc-apolice. Deploy: `deploy-service`, serviço svc-apolice, com aviso FAKE enquanto faltar Dockerfile.

## apps/svc-sinistro

Frente de outro agente, ainda sem implementação, configuração ou scripts de execução/teste no `apps/svc-sinistro/package.json`. Entregará abertura e acompanhamento de sinistros para o chatbot, seguindo `docs/superpowers/specs/2026-10-10-internal-services-contracts.md`.

Porta local prevista no contrato: 3103; Cloud Run usa `PORT` e a convenção 8080. `/health` e `/ready` são requisitos futuros. Execute pelo fake do compose e confira os contratos com `pnpm --filter @seguradora/chatbot test` e smoke. Ambiente e testes reais aguardam implementação. Pendências: `apps/svc-sinistro/CHECKLIST.md`; dono: `WORKBOARD.md`, caminho apps/svc-sinistro. Deploy: `deploy-service`, serviço svc-sinistro, com aviso FAKE enquanto faltar Dockerfile.

## packages/protocol

Biblioteca compartilhada de eventos, payloads, limites, validação Zod e Result. Web, gateway e chatbot importam seus exports diretamente de TypeScript, sem servidor, porta, health endpoint ou variáveis de ambiente próprios.

Não há processo local nem imagem para implantar: é consumida pelos apps e incluída nos builds deles (deploy pelo `deploy-service` do app afetado). Teste com `pnpm --filter @seguradora/protocol test` e confira tipos com `pnpm --filter @seguradora/protocol typecheck`; scripts em `packages/protocol/package.json`, contrato no spec web/gateway/chatbot, pendências em `packages/protocol/CHECKLIST.md`. Dono: `WORKBOARD.md`, caminho packages/protocol.

## packages/resilience

Biblioteca de timeout, retries com backoff/jitter, circuit breaker e bulkhead. Gateway e chatbot compõem suas políticas com ela; não faz chamadas por conta própria nem expõe porta, saúde ou ambiente.

Não há processo local nem deploy isolado; as imagens dos consumidores levam o pacote (use `deploy-service` no app). Execute `pnpm --filter @seguradora/resilience test` e `pnpm --filter @seguradora/resilience typecheck`; scripts em `packages/resilience/package.json`, API em `packages/resilience/src/index.ts`, regras no spec geral, pendências em `packages/resilience/CHECKLIST.md`. Dono: `WORKBOARD.md`, caminho packages/resilience.

## infra/

Infraestrutura compartilhada para executar a pilha local e implantar seis serviços Cloud Run. Contém compose, fake dos três contratos, smoke, CLI e Terraform; detalhes em `infra/README.md` e `docs/deploy.md`.

- Rodar localmente: receita abaixo, fonte `infra/docker-compose.yml`. Só web publica porta no host, `WEB_PORT` default 8080; os demais escutam 8080 internamente.
- Fake: `infra/fake-services/main.ts` inicia o fake de `apps/chatbot/src/test/fake-services.ts`, atendendo os três contratos num processo; `PORT` default 8080. O fake atual não tem `/health` ou `/ready`; compose verifica `GET /v1/sinistros/SN-2001`. As imagens reais precisam cumprir as rotas de saúde do contrato.
- Ambiente do deploy: `infra/.env` é o alvo ignorado pelo git, criado a partir de `infra/.env.example`; defaults declarados em `infra/terraform/variables.tf`. Compose usa um segredo público de desenvolvimento que nunca deve ir para o GCP. Não copie a tabela de configuração.
- Testar: `pnpm test:deploy` usa ferramentas falsas, `pnpm check:skill` confere estas skills, `pnpm check:workboard` confere ownership e links, `pnpm check:runbook` confere documentação. `pnpm test:infra` verifica compose/nginx e derruba a pilha do projeto seguradora; leia `infra/README.md` antes de executar. `bash infra/terraform/validate.sh` valida Terraform offline, sem aplicar.
- Contratos: spec geral e contrato de serviços internos; cobertura e pendências em `infra/CHECKLIST.md`. Dono: `WORKBOARD.md`, caminho infra. Deploy: `deploy-service`; alterações de Terraform devem mostrar o plano ao operador.

## Rodar tudo localmente

Da raiz, com Node e pnpm nas versões de `package.json`, dependências instaladas e Docker disponível:

```bash
docker compose -f infra/docker-compose.yml up -d --build --wait
node infra/smoke.mjs http://localhost:8080
docker compose -f infra/docker-compose.yml down -v
```

Equivalentes: `pnpm compose:up`, `pnpm smoke http://localhost:8080`, `pnpm compose:down`. Para outra porta, defina `WEB_PORT` no compose e passe essa mesma porta à URL do smoke; a origem permitida acompanha essa configuração. A stack usa os fakes; smoke verde não significa que os três serviços reais foram implementados.

## Quando não sei qual serviço mexer

- UI, gravação no navegador, renderers ou execução de Flow: web.
- Sessão, cookie, origem, fila, SSE e replay: gateway.
- Jornada, seleção de Flow, resposta e chamadas a contratos internos: chatbot.
- Payload/schema compartilhado: protocol; política de chamadas e concorrência: resilience.
- Regras de cotação/apólice/sinistro: consulte contrato e dono no workboard, não assuma sua frente.
- Imagem, proxy nginx, compose, smoke ou infraestrutura: infra e o dono do caminho afetado.

Depois de localizar, leia o checklist, as rotas/config e o contrato da frente antes de editar; use os scripts reais do seu package.json.
