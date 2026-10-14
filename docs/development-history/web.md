# Histórico de desenvolvimento: web

Registro histórico de entregas, decisões e pendências; não é gate de conclusão.

Última atualização: 2026-10-13

## Entrada e catálogo de componentes — 2026-10-14

Entregue em React a apresentação aprovada na prévia HTML (`5066b3c`, branch
`feat/web-preview-shell`). A aplicação oferece abas Conversa/Catálogo e seletores
iPhone/Android/Desktop e Claro/Escuro/Sistema. No celular, detecta o SO e ocupa
a tela; o botão no cabeçalho abre configurações com navegação entre as abas.

A conversa e o rascunho permanecem montados durante as trocas. A sessão do gateway,
a saudação inicial e os envios reais continuam geridos pelo `useChat`. O tema
inicial passa a seguir o sistema, mantendo os overrides `?theme=light|dark`.

O catálogo reutiliza os renderizadores reais de mensagens (texto, respostas
rápidas, template, carrossel, documentos, código, localização, áudio e Flow),
bolhas com estados de envio, avisos e indicador de digitação. As ilustrações
são SVGs locais e o áudio ilustrativo é gerado localmente. O Flow de demonstração
inclui todos os tipos registrados, com um seletor de mídia por tela, e usa callbacks
isolados: seleções, uploads e conclusão não enviam eventos ao gateway nem são
gravados no histórico de chat. A fonte canônica das jornadas reais não mudou.

A moldura impede rolagem externa ao focar os diálogos; a rolagem permanece no
conteúdo. Flows e documentos ficam contidos no aparelho selecionado. O retorno do
foco é feito após remover `inert`, preservando o acesso ao botão de abertura.

Evidência proporcional: 946 testes web passaram; typecheck e ESLint dos arquivos
afetados limpos; seis E2E da apresentação passaram em Chromium desktop/iPhone 13/
Pixel 7; dois E2E de regressão dos Flows reais passaram (cotação ponta a ponta e
Voltar/Fechar/foco). O build Vite foi realizado pelas execuções E2E. Screenshots
do catálogo e do formulário foram revisados visualmente. Workboard e whitespace
validados. Branch de entrega: `feat/web-experience-shell`.

Esta entrega é local, sem merge, push ou deploy. As pendências anteriores de
fidelidade e aceite das Tasks 9–10 continuam fora deste escopo.

### Reconstrução do ambiente local — 2026-10-14

Após autorização do usuário, a imagem `seguradora-web:latest` foi reconstruída
com `docker compose -f infra/docker-compose.yml build web` e o container web foi
recriado com `up -d --no-deps --no-build --wait web`. A nova interface está servida
em http://localhost:8080. Gateway, chatbot e fake-services mantiveram seus IDs
e permaneceram saudáveis. Imagem web: `c1090cb28928`; bundle JS: `index-4Y_JS2Na.js`.

A suíte raiz passou após repetição com permissão para abrir portas locais
(a execução inicial foi interrompida devido a EPERM do sandbox). Build concluído,
smoke 7/7 e oito verificações de navegador no ambiente real passaram: backend
online, catálogo/imagens, tema, aparelho, conclusão local de Flow e Android em
tela cheia. Screenshots revisados em `/private/tmp/seguradora-web-runtime-*.png`.
Operação local; sem merge, push ou GCP.

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
- [x] Renderer de documentos demonstrativos com descrição do diálogo anunciada a leitores de tela e registry exaustivo para novos eventos `message.*`
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
- [x] Task 7 round 1: revisão com valores seguros, correção pré-preenchida, CPF mascarado e dados iniciais ausentes de saves/loads persistidos
- [x] Task 7 round 2: load regrava a sessão saneada antes de retornar; Flows dependentes do draft viram mensagem de expiração sem CTA na persistência, preservando o Flow ativo em memória
- [x] Task 7 rounds 3–4: snapshots legados dos 15 reviews do catálogo, com uma tela terminal `REVIEW` e sem `initialData`, expiram para texto seguro sem CTA no save/load; IDs sincronizados por teste com o catálogo canônico; Flow externo equivalente permanece acionável e Flow ativo segue interativo. Com `initialData`, qualquer ID expira; falha de regravação impede restauração insegura.
- [x] Task 8: CPF reconhecido em texto do usuário, título de quick reply e resumo de Flow é mascarado só nas cópias persistidas; o estado ativo mantém o original. Saves legados são saneados e regravados antes da restauração; `optionId`/`replyToId` ficam intactos e payload de `flow_submit` continua ausente do histórico.

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

## Correção da entrada da experiência — 2026-10-13

- [x] Cabeçalho Digio Assistências, identidade visual e tema escuro inicial; boas-vindas uma vez por sessão, preservando conversas restauradas
- [x] Retomada após reset de sessão e migração do menu anterior; envios ativos pertencem ao cliente atual, sem confundir histórico com reenvio ou duplicar a saudação
- [x] Suite web 933/933, testes focados de startup/transporte, typecheck e lint; regressão Playwright 16/16
- [x] E2E Chromium mobile 390×844 na stack real `localhost:8080`: 8/8 para os três produtos, CPF, reset, histórico `sent`, recuperação 401 e retry restaurado; vídeos de evidência em `/tmp/seguradora-assistance-entry-artifacts`
- [ ] Fidelidade visual e cobertura de todas as jornadas do atlas: continua nas Tasks 9 e 10; estes oito cenários não representam aceite das 247 telas

## Plano WhatsApp Assistance Experience — Task 7

- [x] 46 fixtures Flow sincronizadas com os JSONs canônicos; formulários navegam para revisão local com volta que preserva valores e submit único
- [x] Composer demonstrativo oferece somente quatro cenários de áudio locais; nenhum caminho de gravação, microfone, upload ou requisição de mídia na tela do chat
- [x] E2E cobre os quatro IDs e respostas determinísticas, sem chamada a API de mídia

## Plano WhatsApp Assistance Experience — Task 9

- [x] Playwright verifica CPF-canário visível somente no turno ativo, mascarado no `sessionStorage` e restaurado já mascarado
- [x] Gateway simulado não ecoa mensagens com CPF; E2E confirma que o canário não aparece no histórico persistido nem após recarga
- [ ] Suíte Playwright ampliada: 19/19 passou após diagnóstico de 429/Retry-After e espera inicial de 30 s (sem alterar rate limit); 11/11 percursos live passaram. Última correção contextual PLA/CAN foi validada por HTTP/unidade e integrada em novo rebuild local; aceite completo da Task 9 permanece pendente dos 247 estados.
- [x] Fixture IDE-08 sincronizada mecanicamente com o backend: único screen FORM terminal e Footer complete. Suíte web 933/933 e typecheck passaram; demais fontes frontend preservadas.

## Plano WhatsApp Assistance Experience — Task 10

- [x] Checkpoint parcial: 938/938 testes web com um worker e limites temporais originais; 19/19 E2E após respeitar Retry-After, 11/11 live e 24/24 grupos representativos. Typecheck/lint/build aprovados. Execução padrão paralela ainda apresentou falha temporal de renderização; isso foi registrado, não eliminado das asserções.
- [ ] Fidelidade completa ao atlas e acessibilidade de todos os estados ainda pendentes. Capturas representativas dos 24 grupos passaram em localhost:8080 nas larguras 320/390/1440 px (24/24); não equivalem aos 247 estados nem a todas as alternativas.
- [ ] Consolidar revisão visual: Flow branco, seções de revisão em duas colunas, nascimento DD/MM/AAAA, CPF mascarado, formatação canônica e agrupamento de texto/quick replies no mesmo turno. Captura mobile DEP-06 conferida após percurso real de inclusão; regressões finais em andamento.

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

- [x] Identificação CPF sem formulário Flow; migração de histórico IDE-06/08 para orientação textual ao recarregar, mantendo mascaramento do CPF digitado em storage. Novas regressões RED→GREEN; suíte web 942/942, tipos e build verificados em 2026-10-14. CPF de dependente permanece campo cadastral.

- [x] Descoberta em um único Flow com retorno nativo preservando escolhas e envio somente na conclusão. Verificação de 2026-10-13: 940 testes web, 19 E2E padrão; 13 cenários live passando e regressão de dependente repetida separadamente com sucesso após corrigir seletor concorrente.

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


## 2026-10-14 — Descoberta ligada à contratação

- Desenho aprovado em conversa: seleção do serviço → detalhes com benefícios, planos, preços e condições → uma única tela de seleção do plano e CPF → contratação no chat. Substitui, nesta jornada, a sequência anterior de cinco telas e a exigência de CPF exclusivamente textual.
- CPF aparece somente na etapa de contratação e para sessão ainda não identificada; aceita formato com ou sem pontuação, com teclado numérico. A seleção do serviço/plano sobrevive ao retorno; “Rever planos” abre a descoberta com as escolhas preenchidas.
- A conclusão envia uma única submissão ao chatbot. Fechar ou navegar entre telas não inicia contratação. O chat mantém o serviço e o plano selecionados e segue aos dados restantes, sem repetir identificação.
- Evidência: 947 testes web; E2E real de Individual/Familiar, três serviços, CPF inválido, retorno para rever planos, identificação reaproveitada e armazenamento sem CPF bruto. Layout inspecionado em 320/390/1440 px. Tipos e builds web/chatbot verificados; Task TASK-20261014-007.
- Validação em processos locais temporários isolados. Containers existentes e GCP não foram atualizados.


## 2026-10-14 — DIGIO Care e revisão de linguagem

- Marca apresentada como DIGIO Care no cabeçalho, molduras, título da página e Flows. Catálogo de seguros alinhado a Assistência Funeral, Assistência Farmácia e Telemedicina.
- Removidos conteúdo e ícone residencial, serviços de chaveiro/eletricista/encanador e referências de demonstração nas mensagens, acessibilidade, formulários, documentos e retornos do catálogo. Formulário de componentes passa a utilizar somente os três serviços suportados, reaproveitando a linguagem visual existente.
- Nenhuma foto nova ou nova interação de produto foi adicionada. Preferência de elementos visuais solicitada ao usuário em pergunta separada; execução permanece pendente dessa resposta.
- Evidência: 948 testes web e 22 E2E de chat/catálogo passaram; tipos/builds/lint e varredura de textos visíveis aprovados. Identificação e descoberta/contratação verificadas com backend temporário atual. Histórico de execuções: TASK-20261014-009.
- Teste E2E de Rever planos passa a aguardar a nova mensagem antes de abri-la, evitando seleção acidental do formulário antigo. Containers existentes não foram atualizados; sem deploy.


## 2026-10-14 — Integração em develop e atualização local

- Merge local de feat/digio-care-copy em develop: 81bd846, sem conflitos. O resultado inclui a moldura web, a descoberta ligada à contratação e a revisão DIGIO Care. Sem push e sem alteração de master/GCP.
- Reconstruídas e recriadas as quatro imagens/containers locais, todos healthy: web bc4721cf8f5b, chatbot 10f37c9956de, gateway 5cd2d19c1854 e fake-services 649a57e436d9. Fonte da imagem: merge 81bd846 + coordenação 150f481; commits seguintes registram evidências e ajuste de espera no teste, sem mudança do produto.
- Disponível em http://localhost:8080. Navegador confirmou título/marca DIGIO Care, catálogo com os três serviços, assets carregados e ausência de referências residenciais/avisos de demonstração na apresentação do catálogo. Captura local: /tmp/DIGIO-Care-develop-local-catalog.png.
- Verificação: suíte raiz em workspaces sequenciais e typecheck raiz passaram; build das quatro imagens; smoke 7/7; quatro E2E reais de identificação e contratação Individual/Familiar passaram.
- Duas esperas de teste corrigidas: auditoria visual aguarda imagens lazy; E2E aguarda o novo botão Continuar em vez do botão desabilitado da mensagem anterior. Sem mudança de aplicação por esses ajustes.
- A primeira conferência visual sofreu timeout da revisão automática de permissão, sem execução; a repetição permitida foi aprovada e concluída. TASK-20261014-010 contém os tempos e resultados, incluindo as tentativas falhas.


## 2026-10-14 — comando /reset no chat

O comando exato `/reset` (com espaços externos opcionais) é interpretado localmente pelo web, sem criar bolha ou enviar o comando ao chatbot. Encerra o cliente anterior, descarta envios pendentes/rascunhos e histórico persistido e cria uma sessão nova; a saudação inicial segue o fluxo existente. Preferências de apresentação permanecem. Eventos atrasados da sessão anterior são ignorados. A sessão antiga no servidor segue seu TTL normal; não há exclusão de registros no backend.

Validação: suíte web 949 testes aprovada; após ajuste da revisão, todos os 30 testes de useChat passaram, incluindo reset e troca de ownership entre abas. E2E Chromium verificou cookie novo, saudação única, ausência de envio de /reset e histórico limpo após reload. Typecheck e lint aprovados. Revisão identificou e foi corrigida a preservação de status failed no encerramento comum do cliente, mantendo reenvio após troca de aba. Branch feat/web-reset-command; sem merge, push ou atualização dos containers nesta tarefa.
