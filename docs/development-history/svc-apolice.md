# Histórico de desenvolvimento: svc-apolice

Última atualização: 2026-10-10

## Estrutura
- [ ] Pastas hexagonais criadas (domain / application / infra / main.ts)
- [ ] Configuração por variáveis de ambiente validada na subida
- [ ] Dockerfile e execução local

## Funcionalidades
- [ ] GET /v1/apolices?cpf=
- [ ] GET /v1/apolices/{numero}
- [ ] GET /v1/apolices/{numero}/segunda-via
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
