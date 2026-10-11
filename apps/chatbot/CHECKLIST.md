# Checklist: chatbot

Última atualização: 2026-10-11

## Estrutura

- [x] Pastas hexagonais criadas (domain / application / infra / main.ts)
- [x] Configuração por variáveis de ambiente validada na subida
- [ ] Dockerfile e execução local
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

- [x] Testes unitários (domain e application)
- [x] Testes do diálogo com o classificador real (mock LLM) e frases digitadas por estado (`src/infra/typed-journeys.test.ts`)
- [x] Testes de contrato com serviços fake
- [x] Testes E2E da API
- [x] Lint, formatação e tsconfig estrito sem erros

## Pendências e decisões

- Serviços internos: os testes usam um servidor fake que implementa o contrato; rodar contra os serviços reais quando existirem.
- Autenticação chatbot → serviços (Cloud Run IAM, ID token) não implementada; ingress interno e IAM ficam para o plano de deploy.
- A validação de CPF verifica só o formato (11 dígitos), porque os fixtures dos serviços usam CPFs fictícios sem dígito verificador válido.
- Validar os JSONs dos Flows (cotação e demonstração) no Playground da Meta; hoje só são verificados pelos testes deste repositório.
- Protocolo: falta um evento para o servidor decidir a próxima tela depois de `data_exchange` (hoje o chatbot não responde nada e a web avança de forma otimista); erros de `data_exchange` também não chegam ao servidor.
- Gateway `/v1/media` não existe: ids de mídia dos Flows seguem `local-*`.
- Plano de deploy (Cloud Run, `TRUST_PROXY_HOPS`, Origin/cookies) e teste de integração da pilha completa com os `svc-*` reais.
- Valores de mídia são aceitos em payloads de `navigate` (a Meta proíbe); Escape e seletores nativos só verificados no Chromium (web).
- Ids de botões (quick-reply) são escolhidos pelo cliente: só são restringidos às listas ofertadas nos estados que carregam lista; a 'identificação' por CPF é decorativa na POC (sem autenticação real).
- Os clientes não limitam o tamanho do corpo de resposta dos serviços (internos e confiáveis); revisar se algum dia forem externos.
- Dockerfile não verificado com Docker real (daemon indisponível). Verificado sem Docker: build tsup (bundle ESM com @seguradora/* e Flow JSON embutidos), smoke test do `dist/main.js` (/health ok, SIGTERM com exit 0) e o layout de `pnpm deploy --legacy --prod` montado como na imagem. Rodar `docker build -f apps/chatbot/Dockerfile .` quando houver Docker.
- Botão 'tentar de novo' e entrada 'status do sinistro' no menu não implementados (o menu aceita no máximo 3 quick replies).
- A mensagem da segunda via mostra só a data de validade do link.
