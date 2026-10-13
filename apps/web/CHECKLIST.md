# Checklist: web

Última atualização: 2026-10-13

## Estrutura

- [x] Pastas feature-sliced criadas (chat, renderers, transport, ui; flows entregues no Plano 5)
- [x] Configuração de ambiente (proxy do Vite) validada
- [x] Build Vite e imagem nginx para Cloud Run (com proxy /v1)
- [x] Regras de dependência verificadas (dependency-cruiser)

## Funcionalidades (Plano 4: chat)

- [x] Tokens de design do WhatsApp (claro/escuro) e bolha com ticks
- [x] Texto com formatação do WhatsApp e links seguros
- [x] Parser SSE e SseClient (reconexão, Last-Event-ID, heartbeat)
- [x] ChatClient (sessão, fila de saída com reenvio idempotente, user.ack)
- [x] Estado do chat (reducer)
- [x] Persistência do chat em sessionStorage e aba única (Web Locks)
- [x] Renderers: texto, voz, código, location, template, quick-reply, carrossel, digitando, aviso, mensagem de Flow
- [x] Renderer de documentos demonstrativos com diálogo local acessível
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
- [x] Cotação: `cpf` e `nascimento` são `sensitive` na tela `DADOS`; o resumo mostra `••••` e o E2E confere que nem a bolha nem o sessionStorage guardam os valores (só o `user.flow_submit` os leva ao gateway)
- [x] Fonte única dos Flows: os JSON canônicos ficam em `apps/chatbot/src/domain/flows/`; `src/flows/fixtures/` guarda cópias só para os testes unitários, e `apps/chatbot/src/domain/flows-sync.test.ts` falha se as cópias divergirem

### Decisões próprias (Plano 5)

- NavigationList, ChipsSelector e ImageCarousel não têm documentação completa na spec: só as propriedades abaixo foram implementadas; as demais são ignoradas.
  - NavigationList: `name`, `list-items[]` (máx. 20) com `id`, `main-content{title,description?,metadata?}`, `start{image,alt-text}`, `end{title,description?,metadata?}`, `badge`, `tags[]`, `on-click-action` (via runAction).
  - ChipsSelector: `name`, `label`, `data-source[{id,title}]` (máx. 20), `max-selected-items`, `min-selected-items`, `on-select-action`, `on-unselect-action`; valor em `form[name]` como string[] de ids.
  - ImageCarousel: `images[{src,alt-text}]` (máx. 10; imagens com src inválido são descartadas).
- Mídia: sem endpoint de upload no gateway, `media_id` é `local-<uuid>` (gerado só em `newMediaId`, em `MediaPickers.tsx`; trocar quando existir `/v1/media`). `form[name]` guarda só `{media_id, file_name}[]`, nunca conteúdo.
- Footer usa `aria-disabled` (não `disabled`) para que o toque com erros revele os erros e foque o primeiro campo inválido (`data-flow-field` nos campos).
- `data_exchange` é otimista: o chatbot trata `user.flow_data_exchange` de forma explícita (Plano 6), mas não responde nada, então a web envia o evento (sem bolha nem item na lista), marca `exchange_done` na hora e segue localmente: tela terminal finaliza como `complete` (um único submit), com `next` navega, sem `next` fica na tela. Rever quando existir um evento de protocolo para o servidor decidir a próxima tela.
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
- E2E: o gateway simulado serve os Flows lidos de `apps/chatbot/src/domain/flows/` (fonte canônica) na inicialização (`cotacao flow`, `demo flow`), não responde a `user.flow_data_exchange` (como o chatbot hoje) e expõe só tipo e payload dos eventos de Flow em `GET /__events` (gancho de teste). A ordem dos campos do `<input type="date">` segue o idioma do sistema, então o teste a descobre num campo descartável antes de digitar.
- FlowSheet substitui o placeholder do Plano 4: Fechar/Escape só pedem confirmação (diálogo dentro da folha, não `window.confirm`) quando o usuário editou ou tocou algum campo (o preenchimento por `init-value` não conta; editar e voltar ao valor padrão conta); após `complete` fecha direto. Flow inválido mostra "Não foi possível abrir este formulário." e loga só caminho e código dos problemas. Se a aba fica passiva com a folha aberta, o App a fecha sem enviar; reabrir o mesmo Flow começa do zero (chave por abertura).

## Plano 6 (pendências dos Flows)

- [x] `randomId` com fallback para http sem contexto seguro (`getRandomValues`), usado por `chat-client` e `useChat`; em http o chat funciona, exceto voz e guarda de aba única (ver pendências)
- [x] Campos `sensitive` mascarados no resumo do Flow (cotação: `cpf`, `nascimento`) e conferidos no E2E
- [x] Flow de demonstração vem do catálogo do chatbot; o gateway simulado do E2E lê os JSON canônicos de `apps/chatbot/src/domain/flows/` e um teste de deriva falha se as cópias divergirem
- [x] `data_exchange` explícito no chatbot (turno vazio, sem resposta); a web segue otimista

## Plano 7 (deploy) — atualizado pelo Plano 8

O que existe (verificado localmente, nada aplicado no GCP):

- `infra/docker-compose.yml`: produto inteiro local (`web` → `gateway` → `chatbot` → `fake-services`), com health checks.
- `infra/smoke.mjs`: smoke de ponta a ponta pela URL pública (sete passos; falha nomeia o hop), passa contra o compose.
- `infra/test-nginx.sh`: troca de IP do gateway sem reiniciar o nginx, config renderizado, cabeçalhos e `Host`/`Origin` no upstream.
- `infra/terraform/`: Cloud Run com seis serviços e imagens independentes, rede, seis contas de runtime, secret e orçamento; validado offline (`validate.sh`).
- `.github/workflows/ci.yml` continua com verificação + build sem push; deploy por CI substituído no Plano 8 pelo `infra/deploy.sh` local por serviço; verificadores genéricos e actionlint em `infra/lint-workflows.sh`.
- Runbook `docs/deploy.md` (conferido por `infra/check-runbook.mjs`).

Pendências (detalhes na seção Pendências do runbook):

- Primeiro `terraform apply` e primeiro deploy reais: validar ingress interno + Direct VPC egress, `TRUST_PROXY_HOPS`, URLs computadas e cold start.
- Após atualizar uma imagem pelo script, confirmar que o plano Terraform não mostra alterações de imagem/client/client_version; configuração continua pelo Terraform. Probes HTTP /health de liveness pendentes (startup TCP com placeholder).
- ID token entre serviços, `svc-*` reais, domínio próprio/Cloud Armor/uptime checks, versões fixadas das imagens base.

## Qualidade

- [x] Testes unitários e de componente
- [x] Lint, formatação e tsconfig estrito sem erros

## Pendências e decisões

- A web chama /v1 no mesmo origin (proxy do Vite em dev; nginx em produção).
- Ids (`transport/random-id.ts`): usa `crypto.randomUUID` quando existe e, em http puro (sem contexto seguro), gera UUID v4 com `getRandomValues`; usado por `transport/chat-client.ts` e `chat/useChat.ts` (os Flows têm o próprio `newMediaId`).
- Voz do usuário fica no navegador (sem upload; ver decisão 5 do Plano 4).
- A web não envia user.typing.
- E2E do web roda localmente com `pnpm --filter @seguradora/web e2e`; incluir no CI quando houver cache do Playwright.
- Build Vite e imagem nginx (Plano 7, verificado): `docker build` (inclusive `--no-cache`), `nginx -t` com o template renderizado para `GATEWAY_URL` http e https, smoke da pilha no compose e teste de troca de IP do gateway (`pnpm test:infra`, `infra/test-nginx.sh`). O bundle não tem URLs de aplicação hardcoded (só namespaces w3.org, react.dev e google.com/maps).
- GATEWAY_URL do nginx: o gateway precisa de `ALLOWED_ORIGIN` igual à origem pública da web e `TRUST_PROXY_HOPS` conforme o número de saltos (web -> gateway no Cloud Run); conferir no deploy.
- Upload de áudio do usuário não existe: o áudio gravado fica no navegador.
- Fluxo de pilha completa (web + gateway + chatbot + serviços): coberto pelo smoke do compose (Plano 7, `infra/smoke.mjs`) com o `fake-services` no lugar dos `svc-*`; fora do `pnpm test` porque precisa de Docker.
- Em http puro (sem contexto seguro) `navigator.locks` não existe: a guarda de aba única (Web Locks) fica inativa e toda aba se diz ativa. Uma aba duplicada (sessionStorage copiado = mesma sessão) pode disputar com a outra o stream único do gateway.
- A gravação de voz precisa de `navigator.mediaDevices` (HTTPS ou localhost): em `http://<ip>` o Composer mostra "Não foi possível acessar o microfone.". O fix do randomId cobre só os ids, não o microfone.
- Pendências dos Flows (o que resta depois do Plano 6):
  - Gateway: endpoint `/v1/media` para upload de voz e de mídia de Flows (hoje os ids são `local-*` e nenhum byte sai do navegador).
  - Protocolo: um evento para o servidor decidir a próxima tela depois de `data_exchange` (a web avança de forma otimista e o chatbot não responde nada).
  - Validar os JSON de cotação e demo no Playground da Meta quando houver acesso; NavigationList, ChipsSelector e ImageCarousel seguem como decisões próprias até lá (incluindo o formato de `src` das imagens).
  - Plano de deploy (Cloud Run, `TRUST_PROXY_HOPS`, Origin/cookies); `docker build`, `nginx -t` e o `resolver` do nginx foram verificados no Plano 7.
  - Teste de integração da pilha completa com os `svc-*` reais.
  - Escape com seletores nativos de data e os seletores nativos em si só foram verificados no Chromium; Firefox e Safari não foram testados.
  - Valores de mídia (PhotoPicker/DocumentPicker) são aceitos em payloads de `navigate`, embora a Meta proíba; a web não rejeita.
  - Erros de `data_exchange` não são visíveis ao servidor (o evento é enviado sem resposta).
- [x] nginx resolvido uma vez (feito no Plano 7): o host do gateway é resolvido a cada requisição (`resolver` com o primeiro `nameserver` do `/etc/resolv.conf`, `valid=10s`, e variável no `proxy_pass` com `$request_uri`), então uma troca de IP do upstream não exige reiniciar o nginx (testado recriando o gateway com outro IP). `GATEWAY_URL` precisa ser `http(s)://host[:port]`: a barra final é removida e path, query ou credenciais fazem o contêiner falhar na inicialização com mensagem clara. `Host` e SNI enviados são os do gateway (porta só se não for a padrão), o `Origin` do navegador passa intacto, `X-Forwarded-Proto` vem do salto anterior (ou `$scheme`). `/health` responde `ok` sem log de acesso. Script de entrada: `/docker-entrypoint.d/15-resolver.envsh`, embutido no Dockerfile.
- Caminho de liveness do nginx é `/health` (não `/healthz`): o front end do Cloud Run pode interceptar caminhos terminados em `z`.
