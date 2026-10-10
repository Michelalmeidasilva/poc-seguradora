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

Os contratos de API, as convenções comuns, o handoff para o outro agente e os fixtures obrigatórios estão em **`2026-10-10-internal-services-contracts.md`**. Esse documento é a fonte única de verdade dos três serviços; o chatbot gera seus clientes a partir dele.

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

## 15. Preparação do repositório e acompanhamento

### 15.1 Repositório (pré-requisito do desenvolvimento)

O projeto é um **monorepo pnpm com um único repositório git**, na raiz `seguradora-services/`. Antes de escrever qualquer código de aplicação:
1. Executar `git init` na raiz (já feito) e confirmar que `git status` funciona. Não criar repositórios aninhados dentro de `apps/*` ou `packages/*`.
2. Criar a estrutura de pastas da seção 2 (`apps/web`, `apps/gateway`, `apps/chatbot`, `apps/svc-cotacao`, `apps/svc-apolice`, `apps/svc-sinistro`, `packages/protocol`, `packages/resilience`), cada uma com seu `package.json`.
3. Criar na raiz `.gitignore`, `pnpm-workspace.yaml`, `package.json`, `tsconfig.base.json` e a configuração de lint e formatação.
4. Criar na raiz o `WORKBOARD.md` (seção 15.3), o `AGENTS.md` com as regras e os apontadores para ele (`CLAUDE.md`, `GEMINI.md`, `.cursor/rules/workboard.mdc`, `.github/copilot-instructions.md`), e o script `scripts/workboard-check.mjs`. **O controle de trabalho nasce antes de qualquer implementação.**
5. Fazer o commit inicial dessa estrutura. A partir daí, commits convencionais e pequenos.

### 15.2 `CHECKLIST.md` por serviço

Cada app e cada pacote (`apps/*` e `packages/*`) mantém na sua raiz um `CHECKLIST.md` com o que já foi feito e o que falta. Ele é criado no passo 2 da seção 15.1, antes de qualquer implementação, com todos os itens em aberto. Quem desenvolve atualiza o arquivo **no mesmo commit** que conclui o item.

Formato:
```markdown
# Checklist: <nome do serviço>

Última atualização: YYYY-MM-DD

## Estrutura
- [ ] Pastas hexagonais criadas (domain / application / infra / main.ts)
- [ ] Configuração por variáveis de ambiente validada na subida
- [ ] Dockerfile e execução local

## Funcionalidades
- [ ] <item específico do serviço>

## Qualidade
- [ ] Testes unitários (domain e application)
- [ ] Testes de contrato
- [ ] Lint, formatação e `tsconfig` estrito sem erros

## Pendências e decisões
- <bloqueios, dúvidas ou desvios do spec>
```

O bloco **Funcionalidades** de cada serviço lista:
- `svc-cotacao`, `svc-apolice`, `svc-sinistro`: uma linha por rota do contrato, `openapi.yaml`, fixtures de `data/*.json`, injeção de falha e `/health` + `/ready`.
- `gateway`: sessão/JWT, SSE, `POST /v1/events`, buffer de reenvio, rate limit, idempotência, cliente do chatbot com resiliência.
- `chatbot`: API em NDJSON, máquina de estados, `LlmProvider` mock, `catalog` de mensagens e Flows, clientes dos serviços internos.
- `web`: transporte e fila de reenvio, um item por renderer de mensagem e um por componente de Flows, motor de expressões.
- `packages/protocol` e `packages/resilience`: um item por tipo de mensagem/evento e por mecanismo de resiliência.

Um item só é marcado como concluído quando o código existe, os testes dele passam e o commit foi feito.

### 15.3 `WORKBOARD.md`: controle de trabalho entre agentes

Vários agentes (`claude`, `codex`, `cursor`, `antigravity`) e pessoas podem trabalhar ao mesmo tempo neste monorepo. O `WORKBOARD.md`, na raiz, é a **fonte única** de quem está desenvolvendo o quê. O `CHECKLIST.md` (seção 15.2) detalha o progresso dentro de um serviço; o `WORKBOARD.md` diz de quem ele é e em que estado está.

**Formato:** uma tabela, uma linha por frente de trabalho (*workstream*).

```markdown
# Workboard

Última atualização: YYYY-MM-DD

| Workstream | Caminho | Status | Dono | Branch | Iniciado | Atualizado | Notas |
|---|---|---|---|---|---|---|---|
| protocol | packages/protocol | not_started | - | - | - | - | |
```

**Campos**
- `Status`: `not_started` | `in_progress` | `blocked` | `done`.
- `Dono`: `claude` | `codex` | `cursor` | `antigravity` | `human:<nome>` | `-` (sem dono, só com `not_started`).
- `Branch`: a branch, ou o worktree, em que o dono trabalha.
- `Iniciado` / `Atualizado`: datas ISO. `Notas`: bloqueio, motivo ou o que falta para o `done`.

**Linhas iniciais** (todas `not_started`, sem dono): `protocol` (`packages/protocol`), `resilience` (`packages/resilience`), `svc-cotacao`, `svc-apolice`, `svc-sinistro`, `chatbot`, `gateway`, `web-chat` (`apps/web/src/chat`, `renderers`, `transport`) e `web-flows` (`apps/web/src/flows`). Quem precisar dividir uma frente adiciona linhas novas, com caminhos que não se sobreponham.

**Protocolo**
1. **Antes de começar**, leia o `WORKBOARD.md` atualizado (`git pull` se houver remoto). Escolha uma linha `not_started`.
2. **Reivindique** a linha: `Status` → `in_progress`, `Dono`, `Branch`, `Iniciado` e `Atualizado`. Faça o commit desse arquivo **sozinho** (`chore(workboard): claim <workstream>`) antes de escrever código. Em caso de conflito ao integrar, quem integrou primeiro fica com a linha, e o outro escolhe outra.
3. **Um dono por caminho.** Só edite arquivos do seu caminho. Para mudar um arquivo de outro workstream (em especial `packages/protocol`), peça ao dono, ou registre a mudança em `Notas` da linha dele. A exceção é o contrato dos serviços internos, que só muda com acordo (documento de contratos, seção 1).
4. **Isolamento:** cada agente trabalha em sua própria branch, de preferência em um `git worktree` separado, para não pisar na árvore de trabalho dos outros.
5. **Atualize** `Atualizado` e `Notas` ao concluir um marco, e marque `blocked` com o motivo quando travar.
6. **Ao terminar**, só marque `done` com o `CHECKLIST.md` do serviço 100% marcado e os testes passando. Mantenha `Dono` para a rastreabilidade.
7. **Reivindicação obsoleta:** uma linha `in_progress` sem atualização há mais de 24 h pode ser retomada por outro. Quem retoma registra em `Notas` de quem era e o motivo.

**Regra obrigatória para todo agente.** O protocolo acima vale para **qualquer chatbot, agente de código ou assistente de IA que execute uma tarefa neste repositório**, listado ou não (claude, codex, cursor, antigravity, copilot, gemini e outros), e para pessoas. Nenhum agente edita código, cria arquivos ou faz commits fora do próprio caminho sem antes ter reivindicado uma linha no `WORKBOARD.md`. Um agente que não consiga ler os arquivos de instrução abaixo deve receber essa regra no prompt da tarefa.

**Apontadores para os agentes:**
- **`AGENTS.md`** na raiz é a **fonte única** das regras: leia o `WORKBOARD.md` antes de tocar no código, reivindique uma linha, respeite o caminho dos outros, trabalhe em branch ou worktree próprio e atualize o `CHECKLIST.md`. É o arquivo padrão lido por codex, cursor e antigravity.
- Os demais arquivos só apontam para ele, em uma ou duas linhas, para não divergirem:
  - `CLAUDE.md` (Claude);
  - `GEMINI.md` (Gemini e antigravity);
  - `.cursor/rules/workboard.mdc` (Cursor, regra sempre aplicada);
  - `.github/copilot-instructions.md` (GitHub Copilot).
- Quando uma ferramenta nova passar a trabalhar no repositório, adiciona-se o apontador dela e atualiza-se esta lista, sem copiar as regras.
- O `scripts/workboard-check.mjs` também verifica que cada apontador existe e menciona `AGENTS.md`.

**Skill do repositório:** `.claude/skills/workboard-protocol/SKILL.md` empacota esta seção (protocolo do `WORKBOARD.md`, `CHECKLIST.md` e as regras de código da seção 14) como uma skill para o Claude. Ela é invocada antes de iniciar, continuar ou concluir qualquer tarefa no repositório. Os outros agentes seguem as mesmas regras pelo `AGENTS.md`. Em caso de divergência, o spec prevalece e a skill é corrigida.

**Validação:** `scripts/workboard-check.mjs` (Node, sem dependências) falha com código ≠ 0 se:
- o cabeçalho ou uma linha da tabela estiver mal formado;
- `Status` ou `Dono` tiver valor fora dos permitidos;
- `in_progress` ou `blocked` não tiver `Dono`, `Branch` e `Iniciado`;
- dois workstreams não `done` tiverem caminhos que se sobreponham;
- um caminho listado não existir no repositório (depois que a estrutura da seção 15.1 for criada).

O script roda no CI e como *pre-commit hook* opcional. Ele só valida o formato e a consistência do arquivo; a honestidade da reivindicação depende do protocolo acima.
