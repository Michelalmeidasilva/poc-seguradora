# Checklist: svc-sinistro

Última atualização: 2026-10-10

## Estrutura
- [ ] Pastas hexagonais criadas (domain / application / infra / main.ts)
- [ ] Configuração por variáveis de ambiente validada na subida
- [ ] Dockerfile e execução local

## Funcionalidades
- [ ] POST /v1/sinistros
- [ ] GET /v1/sinistros/{protocolo}
- [ ] GET /v1/sinistros?apolice=
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
