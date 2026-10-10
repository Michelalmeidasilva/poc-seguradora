# Checklist: web

Última atualização: 2026-10-10

## Estrutura
- [ ] Pastas feature-sliced criadas (chat, renderers, transport, flows, ui)
- [ ] Configuração por variáveis de ambiente (Vite) validada
- [ ] Build Vite e imagem nginx para Cloud Run

## Funcionalidades
- [ ] Transporte SSE + POST e fila de reenvio
- [ ] Renderers: texto, voz, código, location, template, carousel, quick-reply, digitando
- [ ] Motor de expressões de Flows
- [ ] Componentes de Flows (texto, entrada, navegação, estruturais)
- [ ] Ações de Flows (navigate, complete, data_exchange, open_url, update_data)
- [ ] Tema claro e escuro, acessibilidade
- [ ] E2E (Playwright)

## Qualidade
- [ ] Testes unitários (domain e application)
- [ ] Testes de contrato
- [ ] Lint, formatação e tsconfig estrito sem erros

## Pendências e decisões
- Nenhuma.
