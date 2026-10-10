# POC Chatbot Web com UI estilo WhatsApp: Design

Data: 2026-10-10 · Status: aguardando revisão

## 1. Objetivo e escopo

POC para apresentar ao time de negócios um chatbot web que reproduz os elementos de chat do WhatsApp e os componentes de WhatsApp Flows da Meta. Deve ser **funcional de ponta a ponta** e **visualmente fiel** ao layout da Meta.

**Dentro do escopo**
1. Interface web com mensagens (texto, voz, código, location, template, carousel, quick-reply) e motor de Flows.
2. Mensageria entre web e chatbot com protocolo próprio sobre SSE + POST.
3. Arquitetura de serviços (gateway, chatbot, serviços internos) com resiliência e segurança básicas.

**Premissas**
- Publicada no Google Cloud, URL pública **sem login**, apenas dados fictícios.
- Serviços internos (cotação, apólice, sinistro) são APIs reais que leem JSON do filesystem.
- LLM mockado atrás de uma interface trocável.
- Sem observabilidade além de logs da aplicação.
- Sem integração com a WhatsApp Cloud API da Meta.

**Fora do escopo:** broker de mensagens, autenticação de usuário, persistência durável, métricas e tracing, mensagens proativas do chatbot.

**Critérios de sucesso**
- Um cenário de demo exercita todos os tipos de mensagem e todos os componentes de Flows listados na seção 5.
- Derrubar um serviço interno (ou ativar a injeção de falha) resulta em fallback amigável, e a conversa continua.
- A reconexão do SSE não duplica nem perde mensagens.

## 2. Arquitetura

```
Web (React+Vite) ⇄ Gateway (SSE + POST) ──HTTP stream──▶ Chatbot ──HTTP──▶ svc-cotacao
                                                                    ├────▶ svc-apolice
                                                                    └────▶ svc-sinistro
                                                              (JSON no filesystem)
```

Monorepo pnpm, TypeScript de ponta a ponta:
```
packages/protocol     schemas Zod + tipos (compartilhado)
packages/resilience   timeout, retry, circuit breaker, bulkhead
apps/web  apps/gateway  apps/chatbot
apps/svc-cotacao  apps/svc-apolice  apps/svc-sinistro
```

Cada app é um serviço Cloud Run (incluindo a web, servida por nginx). Estado de sessão em memória.

## 3. Protocolo (SSE + POST)

**Canais:** `GET /v1/stream` (SSE, servidor→cliente) e `POST /v1/events` (cliente→servidor).

**Envelope**
```ts
Envelope = {
  v: 1,
  id: string,            // messageId (UUID v7), chave de idempotência
  seq: number,           // por sessão, atribuído pelo gateway (servidor→cliente)
  sessionId: string,
  correlationId: string,
  ts: string,            // ISO 8601
  type: string,
  payload: object
}
```

**Servidor→cliente:** `message.text`, `message.voice`, `message.code`, `message.location`, `message.template`, `message.carousel`, `message.quick_replies`, `message.flow`, `status.typing`, `status.delivered`, `status.read`, `error`.

**Cliente→servidor:** `user.text`, `user.voice` (mídia enviada antes por upload e referenciada por ID), `user.quick_reply`, `user.flow_submit`, `user.flow_data_exchange`, `user.typing`, `user.ack`.

**Garantias**
1. **Idempotência:** `id` repetido devolve o resultado anterior e não reexecuta a lógica (gateway e chatbot guardam os `id`s recentes por sessão).
2. **Ordenação:** `seq` monotônico por sessão. O cliente descarta duplicatas e detecta lacunas.
3. **Retomada:** `id:` do SSE = `seq`. Na reconexão, `Last-Event-ID` faz o gateway reenviar do buffer (janela de 200 eventos por sessão).
4. **Entrega:** `status.delivered` quando a mensagem do usuário chega ao chatbot. `user.ack` carrega o último `seq` processado.
5. **Reenvio no cliente:** fila local com estados enviando/falhou e botão de reenviar. O reenvio usa o mesmo `id`.
6. **Saúde da conexão:** heartbeat a cada ~15 s, `retry:` definido pelo servidor, backoff com jitter. Reconexão antes do timeout do Cloud Run é transparente.
7. **Sessão:** JWT anônimo curto em cookie `HttpOnly` + `SameSite`. Token inválido ou expirado → 401, e a web inicia nova sessão.
8. **Limites:** tamanho máximo de payload, rate limit por sessão e por IP, `error` com códigos estáveis (`rate_limited`, `invalid_schema`, `upstream_unavailable`).
9. **Versionamento:** campo `v` e prefixo `/v1`.

O protocolo é independente do transporte. Um adaptador WebSocket pode ser adicionado ao gateway depois, sem mudar o schema.

## 4. Web (React + Vite + TypeScript)

```
apps/web/src
  chat/        lista de mensagens, composer, status, reconexão
  renderers/   registry type → componente
  flows/       motor de Flows
  transport/   cliente SSE + POST, fila de reenvio, ack
  ui/          tokens de design do WhatsApp (cores, tipografia, bolhas)
```

**Renderers de mensagem**
- **Texto:** formatação estilo WhatsApp (negrito, itálico, tachado, monoespaçado), links, horário e ticks.
- **Voz:** player com waveform e velocidade.
- **Código:** bloco monoespaçado com botão de copiar.
- **Location:** cartão com mapa estático e botão de abrir.
- **Template:** cabeçalho, corpo, rodapé e botões (CTA e resposta rápida).
- **Carousel:** cartões horizontais com mídia e botões.
- **Quick-reply:** botões sob a bolha, desativados após o uso.
- **Digitando:** indicador de três pontos.

**Estado e acessibilidade:** estado local por mensagem (enviando, enviado, entregue, lido, falhou), navegação por teclado, `aria-live` para novas mensagens, tema claro e escuro.

## 5. Motor de Flows

Um Flow é um JSON declarativo (`version`, `screens[]`, `routing_model`). Abre em tela cheia (bottom sheet) a partir de `message.flow` e tem cabeçalho, conteúdo rolável e Footer fixo.

**Componentes cobertos** (propriedades e limites conferidos na documentação da Meta em 2026-10-10: `developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/components`)

| Grupo | Componentes |
|---|---|
| Texto | TextHeading (80), TextSubheading (80), TextBody (4096), TextCaption (409), RichText (5.1+) |
| Entrada | TextInput, TextArea, CheckboxGroup (1–20 opções), RadioButtonsGroup, Dropdown (1–200 opções), OptIn (máx. 5/tela), DatePicker, CalendarPicker (6.1+, modos single e range), Media upload |
| Navegação/exibição | Footer (máx. 1/tela), EmbeddedLink (máx. 2/tela), Image (máx. 3/tela), NavigationList (6.2), Chips Selector (6.3), Image Carousel (7.1) |
| Estruturais | If (4.0+, até 3 níveis), Switch (4.0+) |

Máximo de 50 componentes por tela.

**Media upload** (guia `.../flows/guides/media_upload`, Flow JSON 4.0+)
- `PhotoPicker`: `label` (80), `description` (300), `photo-source` (`camera_gallery` | `camera` | `gallery`), `min-uploaded-photos` (0–30, >0 torna obrigatório), `max-uploaded-photos` (1–30), `max-file-size-kb` (1–25600), `enabled`, `visible`, `error-message`.
- `DocumentPicker`: mesmas propriedades, com `min/max-uploaded-documents` e `allowed-mime-types` no lugar de `photo-source` e das contagens de fotos.
- Restrições: um PhotoPicker ou DocumentPicker por tela (nunca os dois); não aceita `init-value`; o valor não vai em `navigate` e, em `data_exchange` ou `complete`, deve ser uma propriedade de primeiro nível.
- Na POC, o arquivo é enviado ao gateway por upload e o payload carrega só uma referência (`media_id`, `file_name`). A criptografia AES-256-CBC do endpoint real da Meta não é reproduzida.

**NavigationList, Chips Selector e Image Carousel** não estão na página oficial de componentes nem no índice da documentação. O que se confirmou pelo changelog da Meta e por fontes secundárias:
- `NavigationList`: Flow JSON 6.2. Cada item navega para outra tela e pode mostrar texto, imagens e tags.
- `ChipsSelector`: Flow JSON 6.3. Seletor compacto de opções (preferências, horários). Desde a 7.1 funciona dentro de `If`/`Switch` e aceita `on-select-action` e `on-unselect-action`.
- `ImageCarousel`: Flow JSON 7.1. Propriedades confirmadas só em fonte secundária (8x8): `type`, `images[]` com `src` e `alt-text`.
- Propriedades, limites de itens e de caracteres **não estão documentados em fonte oficial acessível**. A POC implementa o que foi confirmado acima e documenta as demais escolhas (por exemplo, limites de itens) como decisões próprias, validadas contra o Playground da Meta quando possível.

**Expressões:** `${data.campo}` (dados do servidor) e `${form.campo}` (campos preenchidos). Condições de `If` com `==`, `!=`, `&&`, `||`, `!`, `>`, `>=`, `<`, `<=` e parênteses, devem conter ao menos um valor dinâmico e resolver para booleano. Regra do Footer dentro de `If`: se um ramo tem Footer, o outro também deve ter, e nenhum Footer pode existir fora do `If`.

**Ações** (guia Flow JSON da Meta):
- `navigate`: vai para outra tela. O `payload` fica disponível na próxima tela como `${data.campo}`. Não deve ser usada no Footer de uma tela terminal.
- `complete`: encerra o Flow e envia a resposta ao chat (na POC, `user.flow_submit`). Fica numa tela terminal, com payload mínimo (só dados digitados, sem imagens base64).
- `data_exchange`: envia o payload ao endpoint antes de avançar ou finalizar (na POC, `user.flow_data_exchange`). O servidor decide o próximo passo.
- `open_url` (6.0+): abre um link externo.
- `update_data` (6.0+): atualiza a tela atual em resposta a uma interação, e `on-unselect-action` o reverte. Documentado só no changelog, então a semântica fica a validar.

**Propriedades de tela:** `id` (obrigatório, `SUCCESS` é reservado), `layout`, `title`, `terminal` (a tela terminal exige Footer), `success` (padrão `true`), `data` (JSON Schema com `__example__`), `refresh_on_back` (só com endpoint) e `sensitive` (5.1+, oculta campos no resumo).

**`routing_model`:** mapeia cada tela às telas de destino, com limite de 10 ramos. Lista só arestas de ida (o botão voltar é implícito). Exige uma tela de entrada sem arestas de entrada, e todos os caminhos terminam numa tela terminal.

**Validação:** `required`, tipo de entrada, `min-chars`/`max-chars`, `helper-text` e `error-message`. Footer bloqueado enquanto houver campo inválido.

## 6. Gateway (Node + Fastify)

- Emite a sessão, mantém o SSE, valida com Zod, atribui `seq`, guarda o buffer de reenvio e aplica rate limit.
- Chama o chatbot por `POST /v1/chat/events` e consome a resposta como **stream NDJSON** (uma mensagem por linha). A conexão fecha ao fim do turno.
- Timeout, retry com backoff e jitter só para falhas seguras (idempotência pelo `id`) e circuit breaker. Circuito aberto → `error` `upstream_unavailable` amigável ao usuário.
- CORS restrito à origem da web. Segredo do JWT no Secret Manager.
- Cloud Run: `max-instances` baixo com afinidade de sessão, timeout de 60 min com reconexão transparente.

**Evolução futura:** se o chatbot precisar enviar mensagens fora de um turno do usuário, trocar para um adaptador de entrega por callback, sem mudar o protocolo da web.

## 7. Chatbot (Node + Fastify)

- `api`: recebe o evento e responde por stream NDJSON.
- `dialog`: máquina de estados por sessão (cotação, apólice, sinistro), estado em memória.
- `llm`: interface `LlmProvider` com mock determinístico (regras e palavras-chave) para intenção, extração de campos e resposta livre.
- `catalog`: monta mensagens e Flows (templates, carousel, quick-replies) a partir de definições JSON.
- `clients`: clientes dos serviços internos usando `packages/resilience`.
- Idempotência por `id`. Falha de serviço interno → fallback com explicação e opção de tentar de novo, preservando o estado.

## 8. Serviços internos

- `svc-cotacao`, `svc-apolice`, `svc-sinistro`: REST/JSON lendo `data/*.json` embutidos na imagem, somente leitura.
- Operações de escrita simuladas (nova cotação, abertura de sinistro) devolvem um protocolo gerado, sem persistir.
- Injeção de falha opcional (latência e erro por cabeçalho), habilitada por variável de ambiente e desligada por padrão. Serve para demonstrar retry e circuit breaker.

### 8.1 Instrução de desenvolvimento (handoff)

Os três serviços desta seção serão desenvolvidos **por outro agente, em paralelo** ao restante do sistema. Esta seção descreve **somente os contratos**. A implementação interna é livre, desde que:
- siga a estrutura hexagonal da seção 14 (`domain` / `application` / `infra` / `main.ts`);
- cumpra exatamente os contratos abaixo (rotas, campos, nomes, tipos, códigos de status e erros);
- não altere um contrato sem acordo prévio, porque o chatbot gera seus clientes a partir dele;
- entregue em cada serviço um `openapi.yaml` fiel a este contrato, os fixtures de `data/*.json` da seção 8.6 e testes de contrato.

### 8.2 Convenções comuns aos três serviços

- **Formato:** JSON, UTF-8, prefixo `/v1`. Datas em ISO 8601 (`2026-10-10T12:00:00Z`, ou `YYYY-MM-DD` quando for só data). Valores monetários como inteiro em centavos (`valorCentavos`) e `moeda: "BRL"`.
- **Cabeçalhos de requisição:** `X-Correlation-Id` (obrigatório, devolvido na resposta e presente em todo log) e `Authorization: Bearer <id-token>` (token de service account do Cloud Run; validação desligada em desenvolvimento local por variável de ambiente).
- **Saúde:** `GET /health` (processo vivo) e `GET /ready` (dados carregados) respondem 200 sem autenticação.
- **Portas locais:** cotação 3101, apólice 3102, sinistro 3103. No Cloud Run, a porta vem de `PORT`.
- **Modelo de erro** (qualquer status ≥ 400):
```json
{ "error": { "code": "not_found", "message": "texto legível", "correlationId": "..." } }
```
| Status | `code` | Quando |
|---|---|---|
| 400 | `validation_error` | corpo ou parâmetro inválido (`message` indica o campo) |
| 404 | `not_found` | recurso inexistente |
| 409 | `conflict` | operação incompatível com o estado do recurso |
| 429 | `rate_limited` | uso excessivo |
| 500 | `internal_error` | falha inesperada |
| 503 | `unavailable` | indisponibilidade (também usada pela injeção de falha) |
- **Injeção de falha** (só com `MOCK_FAULTS=true`, ignorada caso contrário): `X-Mock-Latency-Ms: <inteiro>` atrasa a resposta; `X-Mock-Error: <status>` devolve esse status com o modelo de erro acima, sem executar a operação.
- **Idempotência em `POST`:** o cabeçalho opcional `Idempotency-Key` repetido devolve a mesma resposta, sem criar outro recurso.
- **Dados:** somente leitura a partir de `data/*.json`. Os `POST` devolvem identificadores gerados e, para a resposta ao próprio `Idempotency-Key`, podem guardar em memória. Nada é gravado em disco.
- **Dados fictícios:** CPFs e nomes são sempre fictícios. CPFs na resposta saem mascarados (`***.456.789-**`).

### 8.3 Contrato: `svc-cotacao`

| Método e rota | Descrição |
|---|---|
| `GET /v1/produtos` | Lista os produtos cotáveis |
| `POST /v1/cotacoes` | Calcula uma cotação |
| `GET /v1/cotacoes/{cotacaoId}` | Consulta uma cotação |

`GET /v1/produtos` → 200
```json
{ "produtos": [ { "codigo": "AUTO", "nome": "Seguro Auto",
  "coberturasOpcionais": [ { "codigo": "VIDROS", "nome": "Vidros" } ] } ] }
```
Códigos de produto: `AUTO`, `RESIDENCIAL`, `VIDA`.

`POST /v1/cotacoes` → 201 (400 se inválido)
```json
// corpo
{ "produto": "AUTO",
  "cliente": { "nome": "string", "cpf": "string(11 dígitos)", "dataNascimento": "YYYY-MM-DD" },
  "dados": { },
  "coberturas": ["VIDROS"] }
```
`dados` depende do produto:
- `AUTO`: `{ "veiculo": { "marca": "string", "modelo": "string", "ano": 2020 }, "cep": "string(8 dígitos)" }`
- `RESIDENCIAL`: `{ "cep": "string(8 dígitos)", "tipoImovel": "CASA" | "APARTAMENTO", "valorImovelCentavos": 0 }`
- `VIDA`: `{ "capitalSeguradoCentavos": 0 }`

Resposta:
```json
{ "cotacaoId": "CT-3001", "produto": "AUTO", "status": "CALCULADA",
  "premioMensal": { "valorCentavos": 18990, "moeda": "BRL" },
  "coberturas": [ { "codigo": "COLISAO", "nome": "Colisão", "limiteCentavos": 5000000 } ],
  "criadaEm": "2026-10-10T12:00:00Z", "validaAte": "2026-10-17" }
```
`GET /v1/cotacoes/{cotacaoId}` → 200 com o mesmo corpo acima, ou 404.

### 8.4 Contrato: `svc-apolice`

| Método e rota | Descrição |
|---|---|
| `GET /v1/apolices?cpf={cpf}` | Lista as apólices do cliente (resumo) |
| `GET /v1/apolices/{numero}` | Detalhe de uma apólice |
| `GET /v1/apolices/{numero}/segunda-via` | Gera a segunda via |

`GET /v1/apolices?cpf=` → 200 (400 se `cpf` ausente ou inválido; lista vazia se não houver)
```json
{ "apolices": [ { "numero": "AP-1001", "produto": "AUTO", "status": "ATIVA",
  "vigencia": { "inicio": "2026-01-01", "fim": "2026-12-31" } } ] }
```
`GET /v1/apolices/{numero}` → 200 (404 se não existir)
```json
{ "numero": "AP-1001", "produto": "AUTO",
  "status": "ATIVA",
  "vigencia": { "inicio": "2026-01-01", "fim": "2026-12-31" },
  "segurado": { "nome": "Maria Souza", "cpfMascarado": "***.456.789-**" },
  "coberturas": [ { "codigo": "COLISAO", "nome": "Colisão", "limiteCentavos": 5000000 } ],
  "premio": { "valorCentavos": 18990, "moeda": "BRL", "periodicidade": "MENSAL" },
  "proximoVencimento": "2026-11-10" }
```
`status`: `ATIVA` | `VENCIDA` | `CANCELADA`. `proximoVencimento` é `null` para `VENCIDA` e `CANCELADA`.

`GET /v1/apolices/{numero}/segunda-via` → 200 (404 se não existir; 409 se `CANCELADA`)
```json
{ "numero": "AP-1001", "documentoUrl": "https://exemplo.invalid/docs/AP-1001.pdf",
  "geradoEm": "2026-10-10T12:00:00Z", "expiraEm": "2026-10-10T13:00:00Z" }
```
`documentoUrl` é fictícia (domínio `.invalid`). O serviço não gera PDF.

### 8.5 Contrato: `svc-sinistro`

| Método e rota | Descrição |
|---|---|
| `POST /v1/sinistros` | Abre um sinistro |
| `GET /v1/sinistros/{protocolo}` | Consulta um sinistro e seu histórico |
| `GET /v1/sinistros?apolice={numero}` | Lista os sinistros de uma apólice |

`POST /v1/sinistros` → 201 (400 se inválido; 404 se a apólice não existir; 409 se a apólice não estiver `ATIVA`)
```json
// corpo
{ "apoliceNumero": "AP-1001",
  "tipo": "COLISAO" | "ROUBO" | "FURTO" | "INCENDIO" | "DANOS_ELETRICOS" | "OUTROS",
  "dataOcorrencia": "YYYY-MM-DD",
  "descricao": "string(1..1000)",
  "local": { "latitude": -23.55, "longitude": -46.63, "endereco": "string" },
  "anexos": [ { "mediaId": "string", "fileName": "string" } ] }
```
`local` e `anexos` são opcionais (`anexos` com até 10 itens). `dataOcorrencia` não pode ser futura. Resposta:
```json
{ "protocolo": "SN-2002", "status": "ABERTO",
  "criadoEm": "2026-10-10T12:00:00Z", "previsaoRetorno": "2026-10-15" }
```
`GET /v1/sinistros/{protocolo}` → 200 (404 se não existir)
```json
{ "protocolo": "SN-2001", "apoliceNumero": "AP-1001", "tipo": "COLISAO",
  "status": "EM_ANALISE", "dataOcorrencia": "2026-09-30",
  "descricao": "string",
  "timeline": [ { "ts": "2026-10-01T09:00:00Z", "status": "ABERTO", "descricao": "Sinistro registrado" },
                { "ts": "2026-10-02T14:00:00Z", "status": "EM_ANALISE", "descricao": "Em análise pela equipe" } ] }
```
`status`: `ABERTO` | `EM_ANALISE` | `APROVADO` | `NEGADO` | `ENCERRADO`.

`GET /v1/sinistros?apolice=` → 200 (400 se `apolice` ausente)
```json
{ "sinistros": [ { "protocolo": "SN-2001", "tipo": "COLISAO", "status": "EM_ANALISE",
  "dataOcorrencia": "2026-09-30" } ] }
```

### 8.6 Fixtures obrigatórios (`data/*.json`)

Para que a demo seja determinística, cada serviço entrega, no mínimo:

| Serviço | Fixtures |
|---|---|
| `svc-apolice` | CPF `12345678901` com `AP-1001` (AUTO, `ATIVA`), `AP-1002` (RESIDENCIAL, `VENCIDA`) e `AP-1003` (VIDA, `CANCELADA`). Um CPF sem apólices (`00000000000`) |
| `svc-sinistro` | `SN-2001` (de `AP-1001`, `EM_ANALISE`, com `timeline` de 2 eventos) e `SN-2003` (de `AP-1001`, `ENCERRADO`). Numeração dos novos protocolos a partir de `SN-2002` |
| `svc-cotacao` | `CT-3001` (AUTO, `CALCULADA`) e os três produtos de `GET /v1/produtos`. Prêmios calculados por regra simples e determinística a partir dos dados de entrada |

O chatbot e os testes E2E dependem desses identificadores.

## 9. Segurança

- Só web e gateway são públicos. Chatbot e serviços internos usam ingress `internal` com autenticação por service account (IAM). A comunicação interna exige conector VPC ou egress direto da VPC.
- Validação Zod em toda borda, limites de tamanho, cabeçalhos de segurança e CSP na web.
- Upload de mídia com limite de tamanho, validação de tipo e armazenamento temporário com expiração.
- Proteção contra abuso de custo: `max-instances` baixos, rate limit e orçamento com alerta no GCP.
- Logs estruturados com `correlationId` e sem dados pessoais.
- URL pública sem login: apenas dados fictícios, nunca dados reais.

## 10. Resiliência

| Ponto | Mecanismo |
|---|---|
| web → gateway | reconexão SSE com backoff e jitter, `Last-Event-ID`, fila de reenvio idempotente |
| gateway → chatbot | timeout, retry em falhas seguras, circuit breaker |
| chatbot → serviços | timeout, retry com backoff, circuit breaker, bulkhead por serviço, fallback na conversa |
| sessão | estado em memória, perdido se a instância reciclar (aceito na POC; a web inicia nova sessão) |

## 11. Testes

- Unitários: renderers, motor de expressões, validações, `packages/resilience`.
- Contrato: schemas do protocolo usados pelos dois lados.
- Integração: gateway ↔ chatbot ↔ serviços (incluindo falhas injetadas e reconexão do SSE).
- E2E (Playwright): um cenário que percorre todos os tipos de mensagem e todos os componentes de Flows.

## 12. Deploy

- Um Dockerfile por app, imagens no Artifact Registry, um serviço Cloud Run por app.
- CI no GitHub Actions: build, testes e deploy.
- `docker-compose` local equivalente para desenvolvimento.

## 13. Riscos e decisões aceitas

- Estado em memória no Cloud Run: instâncias recicladas perdem sessões. Mitigação: `max-instances` baixo e afinidade de sessão.
- URL pública sem login: risco de abuso de custo e de conteúdo. Mitigação: rate limit, limites de tamanho e orçamento com alerta.
- Fidelidade ao layout da Meta depende de referência visual. Os tokens de design ficam centralizados para ajuste.

## 14. Padrões e estrutura de código

### 14.1 Padrão arquitetural por camada

| Onde | Padrão | Motivo |
|---|---|---|
| Gateway, chatbot e os três serviços internos | **Hexagonal (ports & adapters)**, mesma estrutura nos cinco serviços | O núcleo não conhece Fastify, HTTP nem filesystem. Trocar o LLM mock pelo real, o JSON por um banco ou o SSE por WebSocket é só um adaptador novo |
| Web | **Feature-sliced** (`chat`, `flows`, `transport`) sobre um núcleo de renderização por registry | Cada funcionalidade é isolada, e um tipo de mensagem ou componente novo não altera o resto |
| Compartilhado | **Contract-first**: `packages/protocol` com Zod como fonte única de verdade | O schema gera os tipos e valida nas duas pontas |

Fora de escopo, por serem excesso para uma POC: DDD completo, CQRS e event sourcing.

### 14.2 Estrutura de um serviço de backend

```
apps/<servico>/src
  domain/        regras puras, sem I/O (entidades, máquina de estados, value objects)
  application/   casos de uso + ports (interfaces), ex.: LlmProvider, PolicyClient, SessionStore
  infra/         adapters: http (Fastify), clients dos serviços, llm-mock, session-memory, leitura de JSON
  main.ts        composition root: monta as dependências por injeção manual
```

- **Regra de dependência:** `infra → application → domain`, nunca o contrário. Verificada com `dependency-cruiser` no CI.
- **Serviços pequenos** (gateway e serviços internos) mantêm as três camadas, mesmo com `domain` enxuto, para que todos sigam a mesma estrutura.

### 14.3 Padrões de projeto

| Padrão | Onde |
|---|---|
| Ports & Adapters | `LlmProvider`, `SessionStore`, clientes dos serviços internos, transporte do gateway |
| State | Máquina de estados do diálogo (cotação, apólice, sinistro) |
| Strategy | Seleção de intenção no LLM mock; transporte SSE/WebSocket no gateway |
| Registry + Factory | Renderers de mensagem e componentes de Flows (web); `catalog` de mensagens (chatbot) |
| Interpreter | Avaliador das expressões `${...}` e das condições de `If` |
| Decorator | `packages/resilience` envolve os clientes HTTP com timeout, retry, circuit breaker e bulkhead |
| Circuit Breaker, Retry com backoff, Bulkhead | Resiliência entre serviços |
| Idempotent Receiver | Tratamento de `messageId` repetido no gateway e no chatbot |
| Observer (pub/sub em memória) | O gateway publica eventos para a conexão SSE da sessão |
| Anti-corruption layer | Cada cliente traduz o formato do serviço para o modelo do chatbot |
| Result type | Erros esperados são valores; exceções ficam para o inesperado |

### 14.4 Convenções transversais

- **Injeção de dependência manual** no composition root, sem framework.
- **Validação nas bordas** com Zod. O domínio só recebe dados já válidos.
- **Configuração** por variáveis de ambiente, validadas na subida (falha rápida).
- **Erros** com códigos estáveis, mapeados em um único ponto da camada HTTP.
- **Testes:** `domain` e `application` sem I/O; adapters por teste de contrato; E2E cobrindo o fluxo completo.
- **Qualidade:** ESLint, Prettier, `tsconfig` estrito e commits convencionais.
