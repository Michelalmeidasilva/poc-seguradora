# Checklist: gateway

Última atualização: 2026-10-11

## Estrutura
- [x] Pastas hexagonais criadas (domain / application / infra / main.ts)
- [x] Configuração por variáveis de ambiente validada na subida
- [x] Dockerfile e execução local
- [x] Regras de dependência verificadas (dependency-cruiser)

## Funcionalidades
- [x] Buffer de eventos com seq e retomada (Last-Event-ID)
- [x] Idempotência por id (typing e ack não ocupam o cache de ids)
- [x] Turnos de uma sessão executam em série (fila FIFO, `MAX_QUEUED_TURNS`; fila cheia → 429)
- [x] Rate limit por sessão e por IP (também em `GET /v1/stream`)
- [x] Limite estrito de criação de sessão por IP (`SESSION_CREATE_CAPACITY`, `SESSION_CREATE_PER_MINUTE`) e TTL curto para sessão nunca usada (`UNUSED_SESSION_TTL_SECONDS`)
- [x] IP do cliente confiável só por contagem de proxies (`TRUST_PROXY_HOPS`, padrão 0; Cloud Run = 1); IP fora dos logs
- [x] Sessão anônima (JWT em cookie HttpOnly) e registro de sessões
- [x] POST /v1/session
- [x] POST /v1/events (validação, limites, 202/200/4xx)
- [x] GET /v1/stream (SSE, heartbeat, Last-Event-ID, substituição de stream)
- [x] Cliente do chatbot (NDJSON) com resiliência
- [x] Mapeamento de falhas em eventos error (upstream_unavailable, internal_error)
- [x] /health e /ready
- [x] Encerramento gracioso

## Qualidade
- [x] Testes unitários (domain e application)
- [x] Testes de integração e E2E com chatbot fake
- [x] Lint, formatação e tsconfig estrito sem erros

## Pendências e decisões
- Cookie entre origens: SameSite=None; Secure exige HTTPS e depende de o navegador aceitar cookies de terceiros; se bloquear, servir web e gateway sob o mesmo site (decidir no deploy).
- IDs de eventos criados pelo gateway usam UUID v4 (o schema aceita qualquer versão).
- Em reconexão com lacuna no buffer, o gateway reenvia o que resta e registra um aviso; a web detecta o salto de seq.
- A política de resiliência (bulkhead, circuit breaker, retry, timeout de conexão) cobre apenas o estabelecimento da conexão com o chatbot; o consumo do stream é limitado só pelo timeout do turno. Um chatbot que responde 200 e trava no meio do stream não abre o circuito nem ocupa vaga do bulkhead. Revisar no Plano 3 se for necessário.
- No encerramento (SIGTERM/SIGINT) turnos do chatbot ainda em andamento são interrompidos; o estado vive em memória e o cliente reenvia com o mesmo id (idempotência).
- Dockerfile (verificado no Plano 7): a imagem é construída no compose (`infra/docker-compose.yml`, contexto na raiz), fica saudável pelo `/health` e passa no smoke de ponta a ponta (`node infra/smoke.mjs http://localhost:8080`, sete passos `ok`), também depois de recriada com outro IP (`infra/test-nginx.sh`). O deploy no Cloud Run (`TRUST_PROXY_HOPS`, Origin/cookies reais) está no runbook `docs/deploy.md` e ainda não foi aplicado.
- Falha no meio do stream (depois de `status.delivered`): o `error` sai sem `messageId` e o id continua registrado; o usuário envia uma nova mensagem. Falha antes da entrega mantém `messageId` e permite reenviar o mesmo id.
- Contrato com o chatbot: `docs/superpowers/specs/2026-10-10-gateway-chatbot-contract.md`.
- `TRUST_PROXY_HOPS` é aplicado como função (`i < hops`) porque o Fastify instalado trata o número como "não confiar em ninguém".
- Upload de mídia (spec §5) não faz parte do gateway nesta fase; será tratado em um plano próprio antes do Plano 4 depender dele.
- Multi-aba: uma nova conexão SSE substitui a anterior e `user.ack` apara o buffer para todas as abas; decidir no Plano 4 (uma aba ativa via BroadcastChannel ou evento de controle).
- Backpressure de escrita do SSE não tratado (limites de taxa limitam o crescimento).
