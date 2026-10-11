# Checklist: web

Última atualização: 2026-10-11

## Estrutura
- [x] Pastas feature-sliced criadas (chat, renderers, transport, ui; flows fica para o Plano 5)
- [x] Configuração de ambiente (proxy do Vite) validada
- [ ] Build Vite e imagem nginx para Cloud Run (com proxy /v1)
- [x] Regras de dependência verificadas (dependency-cruiser)

## Funcionalidades (Plano 4: chat)
- [x] Tokens de design do WhatsApp (claro/escuro) e bolha com ticks
- [x] Texto com formatação do WhatsApp e links seguros
- [x] Parser SSE e SseClient (reconexão, Last-Event-ID, heartbeat)
- [x] ChatClient (sessão, fila de saída com reenvio idempotente, user.ack)
- [x] Estado do chat (reducer)
- [x] Persistência do chat em sessionStorage e aba única (Web Locks)
- [x] Renderers: texto, voz, código, location, template, quick-reply, carrossel, digitando, aviso, mensagem de Flow
- [x] Tela de chat, composer e gravação de voz
- [x] Tema claro e escuro, acessibilidade
- [x] E2E (Playwright) com gateway simulado

## Funcionalidades (Plano 5: Flows)
- [x] Flow JSON: esquema e validação
- [x] Motor de expressões de Flows
- [x] Runtime e validação
- [x] Componentes de Flows: host e texto
- [x] Componentes de Flows: entrada (texto, seleção, opt-in, datas)
- [x] Componentes de Flows: exibição, navegação e estruturais (Image, EmbeddedLink, ImageCarousel, NavigationList, ChipsSelector, If/Switch, Footer)
- [ ] Ações de Flows (navigate, complete, data_exchange, open_url, update_data)

### Decisões próprias (Plano 5)
- NavigationList, ChipsSelector e ImageCarousel não têm documentação completa na spec: só as propriedades abaixo foram implementadas; as demais são ignoradas.
  - NavigationList: `name`, `list-items[]` (máx. 20) com `id`, `main-content{title,description?,metadata?}`, `start{image,alt-text}`, `end{title,description?,metadata?}`, `badge`, `tags[]`, `on-click-action` (via runAction).
  - ChipsSelector: `name`, `label`, `data-source[{id,title}]` (máx. 20), `max-selected-items`, `min-selected-items`, `on-select-action`, `on-unselect-action`; valor em `form[name]` como string[] de ids.
  - ImageCarousel: `images[{src,alt-text}]` (máx. 10; imagens com src inválido são descartadas).
- Footer usa `aria-disabled` (não `disabled`) para que o toque com erros revele os erros e foque o primeiro campo inválido (`data-flow-field` nos campos).

## Qualidade
- [x] Testes unitários e de componente
- [x] Lint, formatação e tsconfig estrito sem erros

## Pendências e decisões
- A web chama /v1 no mesmo origin (proxy do Vite em dev; nginx em produção).
- Voz do usuário fica no navegador (sem upload; ver decisão 5 do Plano 4).
- A web não envia user.typing.
- E2E do web roda localmente com `pnpm --filter @seguradora/web e2e`; incluir no CI quando houver cache do Playwright.
- Build Vite e imagem nginx: `pnpm --filter @seguradora/web build` passa e o bundle não tem URLs de aplicação hardcoded (só namespaces w3.org, react.dev e google.com/maps). O `envsubst` do template funciona, mas o Docker daemon estava parado e o nginx não está instalado: `docker build` e `nginx -t` NÃO foram executados; item mantido desmarcado até validar.
- GATEWAY_URL do nginx: o gateway precisa de `ALLOWED_ORIGIN` igual à origem pública da web e `TRUST_PROXY_HOPS` conforme o número de saltos (web -> gateway no Cloud Run); conferir no deploy.
- Upload de áudio do usuário não existe: o áudio gravado fica no navegador.
- Fluxo de pilha completa (web + gateway + chatbot + serviços) não tem teste automatizado.
- GATEWAY_URL não pode ter barra final nem path (uma barra final remove o /v1 silenciosamente); o nginx resolve o hostname do upstream uma vez na inicialização (considerar `resolver` + variável no proxy_pass se os IPs do Cloud Run mudarem). Ambos não testados: sem Docker/nginx.
