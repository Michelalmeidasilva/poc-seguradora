# Checklist: web

Última atualização: 2026-10-11

## Estrutura
- [x] Pastas feature-sliced criadas (chat, renderers, transport, ui; flows fica para o Plano 5)
- [ ] Configuração de ambiente (proxy do Vite) validada
- [ ] Build Vite e imagem nginx para Cloud Run (com proxy /v1)
- [ ] Regras de dependência verificadas (dependency-cruiser)

## Funcionalidades (Plano 4: chat)
- [x] Tokens de design do WhatsApp (claro/escuro) e bolha com ticks
- [x] Texto com formatação do WhatsApp e links seguros
- [ ] Parser SSE e SseClient (reconexão, Last-Event-ID, heartbeat)
- [ ] ChatClient (sessão, fila de saída com reenvio idempotente, user.ack)
- [ ] Estado do chat (reducer), persistência em sessionStorage e aba única (Web Locks)
- [ ] Renderers: texto, voz, código, location, template, quick-reply, carrossel, digitando, aviso, mensagem de Flow
- [ ] Tela de chat, composer e gravação de voz
- [ ] Tema claro e escuro, acessibilidade
- [ ] E2E (Playwright) com gateway simulado

## Funcionalidades (Plano 5: Flows)
- [ ] Motor de expressões de Flows
- [ ] Componentes de Flows (texto, entrada, navegação, estruturais)
- [ ] Ações de Flows (navigate, complete, data_exchange, open_url, update_data)

## Qualidade
- [ ] Testes unitários e de componente
- [ ] Lint, formatação e tsconfig estrito sem erros

## Pendências e decisões
- A web chama /v1 no mesmo origin (proxy do Vite em dev; nginx em produção).
- Voz do usuário fica no navegador (sem upload; ver decisão 5 do Plano 4).
- A web não envia user.typing.
