# Histórico de desenvolvimento: chatbot

Registro histórico de entregas, decisões e pendências; não é gate de conclusão.

Última atualização: 2026-10-13

## Correção da entrada da experiência — 2026-10-13

- [x] Saudações comuns abrem `ENT-02` e o catálogo dos três serviços; acesso pessoal pelo menu exige CPF antes de continuar
- [x] Sucesso do CPF em `IDE-03` usa “Continuar pedido”, dentro do limite de 20 caracteres; preserva os dois destinos/ações com IDs de botão distintos e resolução pela tela atual
- [x] Regressões de saudação, catálogo, gate e resposta válida após CPF; suíte chatbot 597/597 e typecheck aprovados
- [ ] Aceite completo dos 247 estados e fidelidade do atlas: continua nas Tasks 9 e 10

## Plano WhatsApp Assistance Experience — Task 2

- [x] Catálogo funcional determinístico derivado de `docs/prototypes/whatsapp-experience/catalog.js` com 24 grupos/247 IDs, exclusão do legado, exceção CPF-only `IDE`, artefato JSON sincronizado e teste de deriva por execução do IIFE canônico
- [x] Transições puras das jornadas com gate CPF, descoberta pública, quick replies válidos/obsoletos, destinos inválidos e sem guardar CPF inicial
- [x] Parser de dependente limitado a nome, CPF, nascimento e parentesco explicitamente informados (inclui “meu filho João … CPF dele é … ele nasceu …”); correção preserva os outros campos e não infere sexo/gênero

## Plano WhatsApp Assistance Experience — Task 3

- [x] Gate demonstrativo aceita somente 11 dígitos ASCII ou CPF com pontuação canônica, normaliza para 11 dígitos sem checksum/lookup, retorna passo e estado sincronizados, libera jornadas pessoais apenas após formato aceito e descarta a entrada bruta

## Plano WhatsApp Assistance Experience — Task 4

- [x] `AssistancePort` tipado e separado de `ServicesPort`, com leituras e comandos confirmados publicados para consumo da Task 5
- [x] `MockAssistance` volátil por `sessionId`, fixtures fictícias determinísticas, TTL/capacidade configurados, cópias isoladas, `Result` idempotente e cache FIFO limitada a 256 chaves por sessão
- [x] Composição manual injeta e expõe a porta de assistência; testes de isolamento, expiração, capacidade, idempotência, mutações, falhas e composição

## Plano WhatsApp Assistance Experience — Task 5

- [x] Orquestração das jornadas catalogadas para texto, quick reply, Flow, áudio de fixture e abertura, preservando o diálogo legado e o tratamento silencioso de `flow_data_exchange`
- [x] Validação estrita de Flow, tela atual e destinos canônicos; mutações somente no envio confirmado da revisão e falhas mantêm a tela atual
- [x] Gate CPF persiste apenas `{journeyId, screenId, gateApproved}`, retoma o destino pessoal após aprovação e bloqueia leitura/escrita em qualquer tela protegida sem gate
- [x] Operações tipadas dedicadas para endereço (estado atual + solicitação pendente de verificação), assistência funeral e preferências opcionais; telefone e sexo biológico obrigatórios no dependente
- [x] Documentos limitados a `CON-07`, `UTI-09` e `CAN-08`; áudio restrito a IDs determinísticos do catálogo, sem transcrição ou upload
- [x] Regressões de sessão, idempotência, leitura após escrita, falha sem transição de sucesso, validação, autorização e compatibilidade com o legado
- [x] Verificação final: 578 testes do chatbot, typecheck, build, dependency-cruiser, ESLint dos arquivos alterados e `git diff --check`

## Plano WhatsApp Assistance Experience — Task 7

- [x] 46 Flows JSON versionados para todos os estados `list`, `form` e `review`, gerados do catálogo e servidos pelo chatbot; cópias web sincronizadas e validadas pelo schema/runtime; revisão/correção mantém valores comuns, mascara CPF e não reutiliza draft em outro fluxo
- [x] Escolha de lista validada por índice e destino canônico; correção de revisão retorna sem mutação e preserva os dados anteriores; placeholder de seleção rejeitado; mutação terminal é executada uma única vez
- [x] Quatro IDs de áudio do catálogo continuam sendo os únicos cenários aceitos pelo chatbot

## Plano WhatsApp Assistance Experience — Task 9

- [x] Expiração distingue sessão ausente/expirada e usa TTL `>=`: IDE-05 é emitida no próximo turno, descarta o gate/rascunho e não executa submit antigo. Testes HTTP na fronteira exata e após TTL. Seleção válida PLA-02 preserva modalidade até PLA-06; confirmação reconsulta dependentes e bloqueia Individual incompatível. Sem alteração antes do aceite e replay testados. Suíte chatbot 636/636, typecheck/lint/build aprovados.
- [x] Checkpoint parcial: confirmação textual PLA/CAN mantém a jornada ativa (RED→GREEN); CPF inválido, entradas compartilhadas e proveniência do formulário testados pelo driver HTTP. Chatbot 633/633, protocol 93/93, resilience 63/63, gateway 177/177; typecheck/lint/build/depcruise aprovados. Auditoria global segue vermelha, sem aceite dos 247 estados.
- [ ] Aceite completo dos 247 IDs pendente. Removida a whitelist do baseline anterior (55 IDs na lista, embora o ledger dissesse 54). Audit HTTP separado e estrito: `pnpm --filter @seguradora/chatbot exec vitest run --config src/test/catalog-audit.config.mjs`; lê screenId após ações reais, sem direct-open/injeção. Checkpoint atual com fixtures canônica e sem dependentes: 233 estados observados, 14 não observados; falha de transição PLA-08, zero rótulos acima do limite. O teste estrito continua vermelho e o alcance não comprova todos os predicados/mutações.
- [x] Subset HTTP: correção efetiva de nascimento DEP-14→DEP-16→DEP-17, confirmação única e preservação dos demais campos; cancelamento/replay, retorno humano, leitura do adapter após mutação, isolamento, unavailable/retry, expiração, quatro áudios e documentos com retorno canônico. Suíte chatbot 604/604; logs/eventos do dependente sem CPF-canário e zero chamadas legadas nos cenários de assistência. Isso não comprova leitura dinâmica por todas as telas de cliente nem E2E de todas as mutações.
- [x] Exceção IDE: IDE-01 em chat e IDE-08 com único submit terminal; fixture web IDE-08 sincronizada mecanicamente. Entrada de texto desconhecida inicial/ativa não oferece menu legado; ServicesPort e regressões internas preservadas.
- [ ] Smoke atualizado da assistência observado 7/7 após rebuild atual (393 ms): catálogo com exatamente três serviços, gate CPF, documento do contrato pelo adapter e replay na pilha local. Consolidar alterações e regressões no checkpoint; o smoke não equivale ao aceite dos 247 estados.

## Estrutura

- [x] Pastas hexagonais criadas (domain / application / infra / main.ts)
- [x] Configuração por variáveis de ambiente validada na subida
- [x] Dockerfile e execução local
- [x] Regras de dependência verificadas (dependency-cruiser)

## Funcionalidades

- [x] Modelos, identificadores e validação de entradas (domínio)
- [x] Catálogo de mensagens (texto, quick-reply, template, carousel, código, location) e Flow de cotação
- [x] Flow de cotação declara `sensitive: ["cpf", "nascimento"]` na tela `DADOS` (a web mascara esses campos no resumo)
- [x] Fonte única dos Flows: `src/domain/flows/` (cotação e `demo-componentes.flow.json`) é a cópia canônica; `src/domain/flows-sync.test.ts` falha se as cópias de teste da web (`apps/web/src/flows/fixtures/`) divergirem, e o gateway simulado do E2E da web lê daqui
- [x] Flow de demonstração (`flowId: "demo"`, JSON `demo-componentes.flow.json`): digitar exatamente "demo" ou "demo flow" (sem diferenciar maiúsculas, acentos e espaços) envia o Flow a partir de qualquer estado sem mudá-lo, exceto na descrição do sinistro (texto livre); o envio do Flow `demo` é respondido com "Recebi o formulário de demonstração. Nenhum dado foi guardado." e o menu, sem mudar o estado nem repetir os valores enviados
- [x] `user.flow_data_exchange`: ramo explícito no HandleTurn que responde com um turno vazio (sem typing, sem entrada no diálogo, sem resposta; replay idempotente) e registra em nível debug só `sessionId`, `correlationId`, `flowId`, `screen`, `action` e a quantidade de chaves de `data`, nunca os valores
- [x] Máquina de estados do diálogo (menu, cotação, apólices, segunda via, sinistro, status do sinistro); a descrição do sinistro só é interrompida pela palavra exata "cancelar"; número de apólice, tipo de sinistro, CPF e protocolo digitados respondem a etapa atual; o Flow de cotação é aceito em qualquer estado
- [x] TurnLog: replay idempotente por sessão + event.id (inclusive turno em andamento); Idempotency-Key dos serviços = sha256(sessão + event.id)
- [x] HandleTurn (laço do diálogo, typing, tratamento de falhas, validação de cada evento enviado contra o protocolo, data de hoje no fuso de São Paulo)
- [x] LlmProvider (interface), mock determinístico e guardas (timeout, truncamento, fallback)
- [x] Armazenamento de estado do diálogo em memória (TTL e capacidade)
- [x] Clientes HTTP dos serviços internos com resiliência e camada anticorrupção (formato de número de apólice/protocolo, URL da segunda via só http(s), logs de falha com nome fixo da operação)
- [x] POST /v1/chat/events em NDJSON com cabeçalhos primeiro
- [x] /health e /ready
- [x] Encerramento gracioso: no `close` as rotas param de aceitar requisições, os turnos em andamento e suas respostas têm até `SHUTDOWN_GRACE_MS` (padrão 8000, abaixo dos 10 s do Cloud Run) para terminar e só então as conexões são cortadas (testado: turno de ~300 ms entrega o corpo completo; turno de 5 s é cortado após a carência)

## Plano 6 (pendências dos Flows)

- [x] Flow de cotação com `sensitive` (`cpf`, `nascimento`)
- [x] Flow de demonstração no catálogo (digitar "demo" ou "demo flow") e resposta ao envio do `demo`
- [x] `user.flow_data_exchange` explícito no HandleTurn (turno vazio, log só com metadados)
- [x] Fonte única dos Flows em `src/domain/flows/` com teste de deriva contra as cópias da web

## Qualidade

- [x] Identificação por CPF digitado no chat (2026-10-14): mensagem inteira após trim, somente 11 dígitos ASCII ou formato canônico, sem checksum; erro preserva pedido e nova tentativa. Retomada mantém plano/dados do dependente enquanto o estado volátil existir; Flow antigo não libera gate e IDE-06 não confirma operações. Suíte chatbot 661/661, tipos e build verificados.

- [x] DES-01 reúne serviços, detalhes, planos e condições em um único Flow; validação estrita da conclusão e plano preservado após o gate CPF. Verificação de 2026-10-13: 645 testes chatbot passando; aceite geral das Tasks 9–10 permanece pendente.

- [x] Testes unitários (domain e application)
- [x] Testes do diálogo com o classificador real (mock LLM) e frases digitadas por estado (`src/infra/typed-journeys.test.ts`)
- [x] Testes de contrato com serviços fake
- [x] Testes E2E da API
- [x] Lint, formatação e tsconfig estrito sem erros

## Pendências e decisões

- Serviços internos: os testes usam um servidor fake que implementa o contrato; rodar contra os serviços reais quando existirem.
- Autenticação chatbot → serviços por ID token não implementada; Terraform do Plano 8 configura ingress interno com allUsers e Direct VPC egress, ainda não verificados no GCP.
- A validação de CPF verifica só o formato (11 dígitos), porque os fixtures dos serviços usam CPFs fictícios sem dígito verificador válido.
- Validar os JSONs dos Flows (cotação e demonstração) no Playground da Meta; hoje só são verificados pelos testes deste repositório.
- Protocolo: falta um evento para o servidor decidir a próxima tela depois de `data_exchange` (hoje o chatbot não responde nada e a web avança de forma otimista); erros de `data_exchange` também não chegam ao servidor.
- Gateway `/v1/media` não existe: ids de mídia dos Flows seguem `local-*`.
- Plano de deploy (Cloud Run, `TRUST_PROXY_HOPS`, Origin/cookies) e teste de integração da pilha completa com os `svc-*` reais.
- Valores de mídia são aceitos em payloads de `navigate` (a Meta proíbe); Escape e seletores nativos só verificados no Chromium (web).
- Ids de botões (quick-reply) são escolhidos pelo cliente: só são restringidos às listas ofertadas nos estados que carregam lista; a 'identificação' por CPF é decorativa na POC (sem autenticação real).
- Os clientes não limitam o tamanho do corpo de resposta dos serviços (internos e confiáveis); revisar se algum dia forem externos.
- Deploy local por serviço (Plano 8): `bash infra/deploy.sh deploy chatbot` atualiza só a imagem; configuração/escala pelo Terraform. Cada serviço interno tem deploy independente, com imagem FAKE até seu dono adicionar Dockerfile (raiz como contexto, porta 8080, GET /health). Probes HTTP de liveness e serviços reais pendentes; deploy/rollback/cold start podem perder diálogo em memória.
- Dockerfile (verificado no Plano 7): a imagem é construída no compose (`infra/docker-compose.yml`, contexto na raiz), fica saudável pelo `/health` e passa no smoke de ponta a ponta contra o `fake-services` (`node infra/smoke.mjs http://localhost:8080`: `chatbot`, `demo-flow` e `quote` provam gateway → chatbot → serviços). O deploy no Cloud Run (ingress interno + Direct VPC egress) está no runbook `docs/deploy.md` e ainda não foi aplicado.
- Botão 'tentar de novo' e entrada 'status do sinistro' no menu não implementados (o menu aceita no máximo 3 quick replies).
- A mensagem da segunda via mostra só a data de validade do link.


## 2026-10-14 — Continuidade da descoberta na contratação

- DES-01 passa a ter LIST/DETAILS/CONTRACT. Informações de planos, preços e condições ficam nos detalhes do serviço; a tela seguinte coleta plano e CPF quando necessário.
- A borda valida o CPF com a regra existente de formato (não confirma identidade), aproveita o gate demonstrativo e descarta o CPF antes de formar temporaryData. Serviço/plano são preservados e usados na mensagem e revisão da contratação, inclusive Familiar.
- Sessões identificadas recebem o Flow sem campo/referência de CPF. A transição ADE-01 → ADE-02 segue direto a ADE-03, evitando pedir CPF repetido; o acesso isolado a ADE-02 continua disponível. “Rever planos” aponta a DES-01 com seleção preservada.
- Compatibilidade preservada para submissões antigas de descoberta, conclusão informativa e identificação textual das outras jornadas. Nenhuma compra/cobrança ocorre na conclusão da descoberta.
- Evidência: 665 testes chatbot; regressões de CPF e seleção, HTTP até a revisão, E2E real Individual/Familiar e tipos/builds. Task TASK-20261014-007; sem deploy.


## 2026-10-14 — Redação profissional e retirada residencial

- Mensagens de identificação, descoberta, contratação, dependentes, uso, pagamentos, erros e encerramento usam linguagem do atendimento. Removidos “demonstração”, “fictício”, “neste exemplo/cenário”, avisos editoriais e disclaimers nas superfícies apresentadas ao usuário. As mensagens descrevem a etapa atual sem acrescentar confirmação de identidade, emissão ou pagamento.
- Revisão feita nas fontes canônicas e nas sobrescritas do gerador de identificação, com regeneração dos Flows e fixtures sincronizadas. O protótipo/atlas também foi atualizado; metadados de projeto permanecem internos e não são exibidos no inspetor/galeria.
- Retirado o ramo residencial dos modelos, schemas, parser de cotação, Flow antigo e fake. IDs de sessão e regras funcionais das jornadas atuais preservados. Catálogo apresentado pela web contém Funeral, Farmácia e Telemedicina.
- Evidência: 664 testes chatbot, 177 gateway, 93 protocolo e 63 resiliência passaram em execução sequencial; web 948/948; verificadores raiz 116/116 e deploy hermético 52/52. Rodadas concorrentes falharam em testes temporais preexistentes de heartbeat/timeout do gateway; execução sequencial passou sem alterar gateway.
- A revisão independente aprovou a redação e os limites de ações. Varredura dos campos de apresentação de todas as etapas e todos os Flows canônicos não encontrou avisos de demonstração remanescentes. Task TASK-20261014-009; sem deploy.


## 2026-10-14 — develop integrado e runtime local atualizado

- DIGIO Care integrado localmente em develop pelo merge 81bd846. Imagem chatbot 10f37c9956de reconstruída/recriada com gateway, web e fake-services; todos saudáveis em localhost:8080.
- Suíte raiz e tipos raiz passaram no resultado integrado; smoke 7/7 e quatro cenários E2E reais de identificação e descoberta/contratação passaram. Sem push, master ou GCP.
- Operação e evidências detalhadas em web.md e TASK-20261014-010. Continuam pendentes as imagens/novas interações ainda não escolhidas pelo usuário e as Tasks 9–10 gerais anteriores.


## 2026-10-14 — contratação em um único Flow

A entrada ADE-03 reúne nome, e-mail e escolha do pagamento em “Dados e pagamento”. A próxima tela do mesmo Flow mostra serviço/plano/valor selecionados, dados informados, meio escolhido, condições e documentos, exigindo aceite desmarcado antes de “Confirmar contratação”. Somente a conclusão envia os dados ao chatbot e retorna ao processamento/resultados existentes. O caminho principal deixa de passar por ADE-04/05, PAG-02/03/04 e revisões abertas em Flows separados. Dependentes do plano Familiar podem ser incluídos após a contratação pelo caminho existente.

Correções preservam nome, e-mail e pagamento; alterar qualquer desses campos dentro do Flow invalida o aceite anterior. Dados pessoais de exemplo foram removidos da entrada. A revisão Individual informa somente titular. Entradas antigas de pagamento são redirecionadas à contratação unificada após o gate de CPF. O atlas offline reproduz formulário, revisão e aceite no mesmo Flow.

Evidências: suíte raiz passou (955 web, 671 chatbot, 177 gateway, 93 protocol, 63 resilience, 116 verificadores e 52 cenários de deploy hermético); tipos e lint aprovados. Três E2E reais em portas isoladas cobriram Funeral/Farmácia/Telemedicina, planos Individual/Familiar, os dois meios, seleção preservada, navegação Voltar, consentimento e um único envio ADE-03. Revisão independente aprovada após corrigir texto Individual, invalidação do aceite e comportamento do atlas. Testes HTTP anteriores foram atualizados para a sequência nova; o teste do atlas respeita a abertura automática após CPF. E2E do atlas offline aprovado após a correção da sincronização. Métricas TASK-20261014-012. Sem merge/push/deploy ou alteração dos containers compartilhados.


## 2026-10-14 — /reset e contratação integrados em develop e atualizados localmente

Merge `96253d3` integra `/reset` (8211772) e contratação em Flow único (36e220c) em develop, sem conflitos. Quatro imagens reconstruídas e containers recriados/healthy em http://localhost:8080. Containers: web cf26d8387568 (imagem 81d67a1988e8), chatbot 5d34c1861725 (536cccefbd90), gateway 895d18ad0f75 (269f1ee1cfe0), fake-services b77fa12e2382 (7b7e544d64d4).

Validação no merge: suíte raiz aprovada (955 web/671 chatbot e demais workspaces; 116 verificadores e 52 cenários herméticos), typecheck, build Compose, smoke 7/7 e quatro E2E reais contra os containers atualizados. Três cenários de contratação cobrem os três produtos, os planos e meios de pagamento; reset comprova sessão nova, descarte do histórico e ausência do histórico antigo após reload. Duração do E2E reset inclui recuperação automática do limite de criação de sessões. TASK-20261014-013 registra tempos.

A CLI de nuvem retornou código 3 por falta de ADC e acesso ao Docker no sandbox. O acesso ao socket foi confirmado com permissão elevada; atualização feita pela receita local Compose do runbook, sem usar ADC/GCP. Artefatos não rastreados preservados. Sem push remoto ou alteração de master. Os containers permanecem disponíveis para teste local.
