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
- [x] Componentes de Flows: upload de mídia (PhotoPicker, DocumentPicker)
- [x] Ações de Flows (navigate, complete, data_exchange, open_url, update_data)
- [x] FlowSheet (bottom sheet) e integração
- [x] Flow de demonstração (`fixtures/demo-componentes.flow.json`, versão 7.1) com todos os componentes e ações; teste garante que os tipos do demo são exatamente os do registry
- [x] E2E de Flows: cotação ponta a ponta, demo percorrido só por teclado (com `data_exchange` e `complete`), Voltar/Fechar com confirmação e retorno do foco

### Decisões próprias (Plano 5)

- NavigationList, ChipsSelector e ImageCarousel não têm documentação completa na spec: só as propriedades abaixo foram implementadas; as demais são ignoradas.
  - NavigationList: `name`, `list-items[]` (máx. 20) com `id`, `main-content{title,description?,metadata?}`, `start{image,alt-text}`, `end{title,description?,metadata?}`, `badge`, `tags[]`, `on-click-action` (via runAction).
  - ChipsSelector: `name`, `label`, `data-source[{id,title}]` (máx. 20), `max-selected-items`, `min-selected-items`, `on-select-action`, `on-unselect-action`; valor em `form[name]` como string[] de ids.
  - ImageCarousel: `images[{src,alt-text}]` (máx. 10; imagens com src inválido são descartadas).
- Mídia: sem endpoint de upload no gateway, `media_id` é `local-<uuid>` (gerado só em `newMediaId`, em `MediaPickers.tsx`; trocar quando existir `/v1/media`). `form[name]` guarda só `{media_id, file_name}[]`, nunca conteúdo.
- Footer usa `aria-disabled` (não `disabled`) para que o toque com erros revele os erros e foque o primeiro campo inválido (`data-flow-field` nos campos).
- `data_exchange` é otimista: o chatbot ainda ignora `user.flow_data_exchange` e não responde, então a web envia o evento (sem bolha nem item na lista), marca `exchange_done` na hora e segue localmente: tela terminal finaliza como `complete` (um único submit), com `next` navega, sem `next` fica na tela. Rever quando o chatbot implementar o endpoint.
- `flow_submit.data` não é guardado no chat nem no sessionStorage: só `flowId` e o resumo. Reenvio de um envio de Flow só funciona na mesma página (rascunho em memória); depois de recarregar, não é reenviável (como a voz). Saves antigos com `data` são limpos ao carregar.
- Resumo do envio (`buildSummary`): uma linha `rótulo: valor` por campo enviado (rótulo do componente com o mesmo `name`, senão a chave), Sim/Não, ids de opção trocados pelo título, arquivos pelo nome, até 500 caracteres. Campos `sensitive` (da tela, lista ou `true`, ou do componente) aparecem como `••••`, e qualquer valor que contenha o valor de um campo sensível também é mascarado (pode mascarar a mais). Payload vazio vira "Formulário enviado".
- `update_data` com `on-unselect-action` (ChipsSelector): o select guarda, por `name` do componente, os valores de `data` que o patch substituiu (o primeiro registro vale até o unselect); o unselect os restaura e depois aplica o próprio patch. O registro some ao navegar ou voltar. Semântica a validar (só documentada no changelog).
- `open_url` com URL que não é http(s) é descartada com um `console.warn` sem a URL.
- Referências `${form.x}` entre telas são permitidas (o `form` é compartilhado por todas as telas). Desvio da Meta, que só aceita referências a campos da mesma tela: Flows destinados ao Playground da Meta devem levar valores para a tela seguinte pelo `payload` do `navigate` e lê-los como `${data.*}`. Uma referência a um nome que nenhuma tela declara invalida o Flow ao abrir (mesmo estado de erro amigável; o aviso no console traz só o nome e o código `unknown_form_ref`).
- Condições de `If` com erro de sintaxe invalidam o Flow (`invalid_condition`); a checagem roda com todos os campos vazios, então `not_boolean`/`type_mismatch` causados por campo ainda não preenchido não contam como erro.
- RichText (a Meta não documenta limites): até 4096 caracteres por linha, 20000 no total e 100 linhas; acima disso o Flow inteiro é rejeitado (`rich_text_too_long`, `rich_text_too_many_lines`). Depois da interpolação, o texto de cada componente de texto é cortado em 4096 caracteres (RichText: nos mesmos limites acima), para que um `${form.*}` longo não trave a renderização. Rótulos de link `[rótulo](url)` não podem conter `[` (mantém o custo linear).
- Chaves React: cada componente da tela usa o caminho estrutural no JSON (`children[1].then[0]`, `children[2].cases.AUTO[1]`), então um If/Switch que muda acima de um campo não o remonta (o foco e o valor digitado ficam). Opções de CheckboxGroup, RadioButtonsGroup e Dropdown usam `índice:id`, como ChipsSelector e NavigationList, porque ids vindos do JSON podem se repetir.
- Resumo: datas aparecem em ISO (`2027-01-15`) e um CalendarPicker `range` como `início a fim` (antes o intervalo sumia do resumo; achado pelo E2E).
- Image/ImageCarousel/NavigationList aceitam `src` http(s) ou data URL raster (`data:image/png;base64,...`). A Meta documenta `src` como base64 puro (sem prefixo `data:`): esse formato hoje não é exibido (a imagem some). O demo usa data URL.
- Escape com DatePicker/CalendarPicker (Chromium, verificado no E2E): com o seletor nativo fechado, Escape é da folha (pede confirmação se houver edição); com o seletor aberto (Space), o primeiro Escape só fecha o seletor e o segundo chega à folha.
- E2E: o gateway simulado serve os Flows lidos das fixtures na inicialização (`cotacao flow`, `demo flow`), não responde a `user.flow_data_exchange` (como o chatbot hoje) e expõe só tipo e payload dos eventos de Flow em `GET /__events` (gancho de teste). A ordem dos campos do `<input type="date">` segue o idioma do sistema, então o teste a descobre num campo descartável antes de digitar.
- FlowSheet substitui o placeholder do Plano 4: Fechar/Escape só pedem confirmação (diálogo dentro da folha, não `window.confirm`) quando o usuário editou ou tocou algum campo (o preenchimento por `init-value` não conta; editar e voltar ao valor padrão conta); após `complete` fecha direto. Flow inválido mostra "Não foi possível abrir este formulário." e loga só caminho e código dos problemas. Se a aba fica passiva com a folha aberta, o App a fecha sem enviar; reabrir o mesmo Flow começa do zero (chave por abertura).

## Qualidade

- [x] Testes unitários e de componente
- [x] Lint, formatação e tsconfig estrito sem erros

## Pendências e decisões

- A web chama /v1 no mesmo origin (proxy do Vite em dev; nginx em produção).
- Ids (`transport/random-id.ts`): usa `crypto.randomUUID` quando existe e, em http puro (sem contexto seguro), gera UUID v4 com `getRandomValues`; usado por `transport/chat-client.ts` e `chat/useChat.ts` (os Flows têm o próprio `newMediaId`).
- Voz do usuário fica no navegador (sem upload; ver decisão 5 do Plano 4).
- A web não envia user.typing.
- E2E do web roda localmente com `pnpm --filter @seguradora/web e2e`; incluir no CI quando houver cache do Playwright.
- Build Vite e imagem nginx: `pnpm --filter @seguradora/web build` passa e o bundle não tem URLs de aplicação hardcoded (só namespaces w3.org, react.dev e google.com/maps). O `envsubst` do template funciona, mas o Docker daemon estava parado e o nginx não está instalado: `docker build` e `nginx -t` NÃO foram executados; item mantido desmarcado até validar.
- GATEWAY_URL do nginx: o gateway precisa de `ALLOWED_ORIGIN` igual à origem pública da web e `TRUST_PROXY_HOPS` conforme o número de saltos (web -> gateway no Cloud Run); conferir no deploy.
- Upload de áudio do usuário não existe: o áudio gravado fica no navegador.
- Fluxo de pilha completa (web + gateway + chatbot + serviços) não tem teste automatizado.
- Plano 5 (Flows), fora deste plano:
  - Chatbot: tratar `user.flow_data_exchange` (responder com os dados da próxima tela) e ter o Flow `demo-componentes` no catálogo (a linha do chatbot está `done`; reabrir por acordo). Até lá, o `data_exchange` da web é otimista.
  - Gateway: endpoint `/v1/media` para upload de voz e de mídia de Flows (hoje os ids são `local-*` e nenhum byte sai do navegador).
  - Validar os Flows de cotação e demo no Playground da Meta quando houver acesso; NavigationList, ChipsSelector e ImageCarousel seguem como decisões próprias até lá (incluindo o formato de `src` das imagens).
  - Plano de deploy (Cloud Run, `TRUST_PROXY_HOPS`, `resolver` do nginx, `docker build`/`nginx -t`) e teste de integração da pilha completa.
  - Escape com seletores nativos de data só foi verificado no Chromium; Firefox e Safari não foram testados.
  - O `cotacao.flow.json` do chatbot não declara `sensitive`, então CPF e data de nascimento aparecem em claro no resumo guardado no chat (sessionStorage). Adicionar `sensitive: ["cpf", "nascimento"]` no Flow do chatbot (fora desta frente) e uma checagem E2E do resumo guardado.
  - Valores de mídia (PhotoPicker/DocumentPicker) são aceitos em payloads de `navigate`, embora a Meta proíba; a web não rejeita.
- GATEWAY_URL não pode ter barra final nem path (uma barra final remove o /v1 silenciosamente); o nginx resolve o hostname do upstream uma vez na inicialização (considerar `resolver` + variável no proxy_pass se os IPs do Cloud Run mudarem). Ambos não testados: sem Docker/nginx.
