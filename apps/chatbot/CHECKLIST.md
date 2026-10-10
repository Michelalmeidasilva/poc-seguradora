# Checklist: chatbot

Última atualização: 2026-10-10

## Estrutura
- [ ] Pastas hexagonais criadas (domain / application / infra / main.ts)
- [ ] Configuração por variáveis de ambiente validada na subida
- [ ] Dockerfile e execução local

## Funcionalidades
- [ ] API em stream NDJSON
- [ ] Máquina de estados do diálogo
- [ ] LlmProvider (interface) e mock determinístico
- [ ] Catálogo de mensagens e Flows
- [ ] Clientes dos serviços internos com resiliência
- [ ] Idempotência por id

## Qualidade
- [ ] Testes unitários (domain e application)
- [ ] Testes de contrato
- [ ] Lint, formatação e tsconfig estrito sem erros

## Pendências e decisões
- Nenhuma.
