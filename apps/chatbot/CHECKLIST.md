# Checklist: chatbot

Última atualização: 2026-10-10

## Estrutura
- [ ] Pastas hexagonais criadas (domain / application / infra / main.ts)
- [x] Configuração por variáveis de ambiente validada na subida
- [ ] Dockerfile e execução local
- [ ] Regras de dependência verificadas (dependency-cruiser)

## Funcionalidades
- [x] Modelos, identificadores e validação de entradas (domínio)
- [x] Catálogo de mensagens (texto, quick-reply, template, carousel, código, location) e Flow de cotação
- [x] Máquina de estados do diálogo (menu, cotação, apólices, segunda via, sinistro, status do sinistro)
- [ ] TurnLog: replay idempotente por event.id (inclusive turno em andamento)
- [ ] HandleTurn (laço do diálogo, typing, tratamento de falhas)
- [ ] LlmProvider (interface), mock determinístico e guardas (timeout, truncamento, fallback)
- [ ] Armazenamento de estado do diálogo em memória (TTL e capacidade)
- [ ] Clientes HTTP dos serviços internos com resiliência e camada anticorrupção
- [ ] POST /v1/chat/events em NDJSON com cabeçalhos primeiro
- [ ] /health e /ready
- [ ] Encerramento gracioso

## Qualidade
- [ ] Testes unitários (domain e application)
- [ ] Testes de contrato com serviços fake
- [ ] Testes E2E da API
- [ ] Lint, formatação e tsconfig estrito sem erros

## Pendências e decisões
- Serviços internos: os testes usam um servidor fake que implementa o contrato; rodar contra os serviços reais quando existirem.
- Autenticação chatbot → serviços (Cloud Run IAM, ID token) não implementada; ingress interno e IAM ficam para o plano de deploy.
- A validação de CPF verifica só o formato (11 dígitos), porque os fixtures dos serviços usam CPFs fictícios sem dígito verificador válido.
- O JSON do Flow de cotação é uma proposta; o schema de Flow JSON do Plano 5 deve validá-lo.
