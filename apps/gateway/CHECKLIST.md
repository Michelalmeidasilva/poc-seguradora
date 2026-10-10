# Checklist: gateway

Última atualização: 2026-10-10

## Estrutura
- [ ] Pastas hexagonais criadas (domain / application / infra / main.ts)
- [ ] Configuração por variáveis de ambiente validada na subida
- [ ] Dockerfile e execução local

## Funcionalidades
- [ ] Sessão anônima (JWT em cookie HttpOnly)
- [ ] GET /v1/stream (SSE, heartbeat, Last-Event-ID)
- [ ] POST /v1/events (validação, idempotência por id)
- [ ] Buffer de reenvio por sessão
- [ ] Rate limit e limites de payload
- [ ] Cliente do chatbot (NDJSON) com resiliência

## Qualidade
- [ ] Testes unitários (domain e application)
- [ ] Testes de contrato
- [ ] Lint, formatação e tsconfig estrito sem erros

## Pendências e decisões
- Nenhuma.
