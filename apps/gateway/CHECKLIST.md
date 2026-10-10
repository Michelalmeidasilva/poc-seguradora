# Checklist: gateway

Última atualização: 2026-10-10

## Estrutura
- [ ] Pastas hexagonais criadas (domain / application / infra / main.ts)
- [x] Configuração por variáveis de ambiente validada na subida
- [ ] Dockerfile e execução local
- [ ] Regras de dependência verificadas (dependency-cruiser)

## Funcionalidades
- [x] Buffer de eventos com seq e retomada (Last-Event-ID)
- [x] Idempotência por id
- [x] Rate limit por sessão e por IP
- [x] Sessão anônima (JWT em cookie HttpOnly) e registro de sessões (token e registro; cookie na Tarefa 7)
- [ ] POST /v1/session
- [ ] POST /v1/events (validação, limites, 202/200/4xx)
- [ ] GET /v1/stream (SSE, heartbeat, Last-Event-ID, substituição de stream)
- [x] Cliente do chatbot (NDJSON) com resiliência
- [x] Mapeamento de falhas em eventos error (upstream_unavailable, internal_error)
- [ ] /health e /ready
- [ ] Encerramento gracioso

## Qualidade
- [ ] Testes unitários (domain e application)
- [ ] Testes de integração e E2E com chatbot fake
- [ ] Lint, formatação e tsconfig estrito sem erros

## Pendências e decisões
- Cookie entre origens: SameSite=None; Secure exige HTTPS e depende de o navegador aceitar cookies de terceiros; se bloquear, servir web e gateway sob o mesmo site (decidir no deploy).
- IDs de eventos criados pelo gateway usam UUID v4 (o schema aceita qualquer versão).
- Em reconexão com lacuna no buffer, o gateway reenvia o que resta e registra um aviso; a web detecta o salto de seq.
- A retomada por Last-Event-ID só fica completa com a rota SSE (Tarefa 8).
- O cookie e a rota POST /v1/session fecham na Tarefa 7.
- A política de resiliência (bulkhead, circuit breaker, retry, timeout de conexão) cobre apenas o estabelecimento da conexão com o chatbot; o consumo do stream é limitado só pelo timeout do turno. Um chatbot que responde 200 e trava no meio do stream não abre o circuito nem ocupa vaga do bulkhead. Revisar no Plano 3 se for necessário.
