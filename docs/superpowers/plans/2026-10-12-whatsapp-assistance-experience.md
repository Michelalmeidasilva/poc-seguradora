# WhatsApp Assistance Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved WhatsApp-style assistance experience in the existing chatbot and web simulator, covering the 24 functional journeys and 247 states with deterministic, session-scoped mock data.

**Architecture:** One integrated end-to-end implementation, sequenced by protocol, chatbot domain/application/infra, and web presentation. The chatbot remains the authority for journey state and confirmed operations; a typed `AssistancePort` isolates volatile mock data, and the web renders protocol events and local WhatsApp Flow/document/audio interactions. Existing quote, policy, claim, gateway, SSE and POST behavior stays intact.

**Tech Stack:** TypeScript, pnpm workspace, Zod, Vitest, React, Vite, Playwright, existing Docker Compose integration harness.

**Spec:** `docs/superpowers/specs/2026-10-12-whatsapp-assistance-experience-design.md`

## Global Constraints

- Node `>=22.12`; pnpm `10.29.1`.
- Aplicar arquitetura hexagonal `domain` / `application` / `infra` / `main.ts`, com dependências somente `infra → application → domain`.
- Validar entradas de borda com Zod; erros esperados são valores `Result`; composição manual de dependências.
- Cobrir somente Telemedicina, Assistência Funeral (titular e dependentes) e Assistência Farmácia (descontos em redes credenciadas).
- Implementar 24 jornadas / 247 IDs funcionais; `LEG-*` é referência e nunca destino runtime.
- CPF aceita qualquer sequência de 11 dígitos, simples ou `ddd.ddd.ddd-dd`; sem checksum, consulta, titularidade ou alegação de autenticação/identificação.
- Jornadas pessoais exigem o gate CPF; descoberta/FAQ pública não. Não reter CPF inicial no estado do servidor nem persistir CPF reconhecível bruto no `sessionStorage`.
- Não registrar texto do usuário, CPF, nascimento, celular, conteúdo de Flow ou documento em logs.
- Estado mock mutável é volátil, isolado por `sessionId`, sujeito a TTL, e só muda após confirmação explícita; repetir `(sessionId,event.id)` não duplica efeitos.
- Não integrar WhatsApp Cloud API, parceiros, cobrança, emissão de PDF, ticket externo, LLM/transcrição externa, nem áudio real. Dados são fixtures demonstrativas.
- Preservar `ServicesPort`/`HttpServices` e capacidades existentes; usar `AssistancePort` próprio.
- Listas, formulários e revisão usam WhatsApp Flow existente e concluem por `user.flow_submit`; não depender de `user.flow_data_exchange`.
- Fidelidade verificável em 390×844 e 1440×900; layout utilizável a 320 px; componentes novos acessíveis por teclado.

## Review Focus

- CPF malformado, com pontuação parcial ou dígitos a mais deve permanecer bloqueado; qualquer CPF com 11 dígitos, mesmo sem checksum válido, deve passar somente pelo gate demonstrativo. **Teste:** matriz simples/pontuado, limite de dígitos e ausência de consulta/identificação no Task 3.
- Frase de dependente incompleta ou ambígua não pode completar dados por inferência, especialmente parentesco, nascimento ou sexo; correção de um campo preserva os demais. **Teste:** entradas parciais/ambíguas, correção e confirmação explícita no Task 4.
- Quick reply antigo, submissão de Flow repetida ou mesmo evento reenviado não pode operar sobre estado diferente nem duplicar mutação. **Teste:** stale IDs, replay e eventos concorrentes no Task 5.
- CPF inicial e dados de Flow não podem vazar em logs ou armazenamento persistido, embora a conversa ativa mostre a mensagem original. **Teste:** inspeção de logs e `sessionStorage`, com CPF-canário, nos Tasks 5 e 8.
- Sessão expirada, fixture indisponível ou Flow fechado antes do submit deve preservar dados já confirmados e não criar mutação parcial. **Teste:** expiração, falha mockada e cancelamento/fechamento antes de submit nos Tasks 5 e 7.

## Organização dos arquivos e coordenação

- Fonte de telas e IDs: `docs/prototypes/whatsapp-experience/catalog.js`; referência visual: `docs/prototypes/whatsapp-experience/atlas-whatsapp.html`. São leitura/referência nesta implementação; não transportar a interface exploratória para a experiência de cliente.
- Contrato de documento: `packages/protocol/src/payloads.ts`, `packages/protocol/src/events.ts` e testes de eventos do pacote.
- Domínio conversacional novo: módulos coesos em `apps/chatbot/src/domain/`; portas em `apps/chatbot/src/application/ports.ts`; coordenação de turnos em `handle-turn.ts`; fixtures/adapters em `apps/chatbot/src/infra/` e composição em `compose.ts`.
- Apresentação: `apps/web/src/renderers/` para `message.document`, `apps/web/src/chat/persistence.ts` para privacidade, e os testes/e2e existentes em `apps/web/src/` e `apps/web/e2e/`.
- Os workstreams de `packages/protocol`, `apps/chatbot` e `apps/web` já aparecem como concluídos no WORKBOARD. Antes de implementar cada fronteira, o executor deve reabrir/reivindicar a linha aplicável em commit próprio, atualizar `CHECKLIST.md` do serviço no commit que concluir o item e não editar caminho sob outro dono. Em particular, coordenar `packages/protocol` com seu dono atual; não presumir propriedade compartilhada. Rodar `node scripts/workboard-check.mjs` antes de cada commit que altere `WORKBOARD.md`.
- Tarefas são partes de uma só entrega: protocolo, servidor e UI isolados não completam nenhuma jornada. Manter contratos dos blocos abaixo e integrar de ponta a ponta antes do aceite.

---

### Task 1: Definir contrato estrito para cartões de documento

**Files:**
- Modify: `packages/protocol/src/payloads.ts`
- Modify: `packages/protocol/src/events.ts`
- Test: `packages/protocol/src/events.test.ts` (ou novo `packages/protocol/src/document-payload.test.ts`, seguindo convenção local)

**Interfaces:**
- Produces: `DocumentPayload = { documents: Array<{ id: string; title: string; status: 'available' | 'generating' }> }`, evento server `message.document` no `ServerEvent` discriminado.
- Schema estrito: `documents` contém de 1 a 10 itens; `id` e `title` não vazios; `title` limitado a 120 caracteres; cada item rejeita campos desconhecidos. Sem URL, arquivo ou identificador de documento externo.

- [ ] **Step 1: Escrever testes de contrato** para payload válido com ambos os status, lista vazia, lista com 11 itens, status inválido, item com campo extra e evento completo `message.document` com envelope válido.
- [ ] **Step 2: Executar `pnpm --filter @seguradora/protocol test -- events.test.ts`** (ou arquivo novo) e confirmar que falha porque o schema/evento ainda não existe.
- [ ] **Step 3: Implementar `DocumentItemSchema`, `DocumentPayload` e adicionar `message.document` ao `ServerEventSchema`** sem alterar envelope existente nem URL/arquivo.
- [ ] **Step 4: Executar `pnpm --filter @seguradora/protocol test` e `pnpm --filter @seguradora/protocol typecheck`**; confirmar PASS e compatibilidade de todos os eventos anteriores.
- [ ] **Step 5: Atualizar checklist do protocolo, coordenar/reivindicar seu workstream e commitar** como `feat(protocol): add document message event`.

### Task 2: Modelar catálogo executável e transições puras das jornadas

**Files:**
- Create: `apps/chatbot/src/domain/assistance-catalog.ts`
- Create: `apps/chatbot/src/domain/assistance-journey.ts`
- Create: `apps/chatbot/src/domain/dependent-statement.ts`
- Test: `apps/chatbot/src/domain/assistance-catalog.test.ts`
- Test: `apps/chatbot/src/domain/assistance-journey.test.ts`
- Test: `apps/chatbot/src/domain/dependent-statement.test.ts`

**Interfaces:**
- Consumes: `docs/prototypes/whatsapp-experience/catalog.js` como fonte de IDs, textos, modalidade, ações e destinos.
- Produces: catálogo TS tipado com `journeyId`, `step.id`, `mode`, conteúdo e ações; `nextAssistanceState(state, input): AssistanceStep`; `parseDependentStatement(text): ParsedDependentFields`, extraindo apenas nome, CPF, nascimento e parentesco explícitos.
- Estado mínimo: `journeyId`, `screenId`, gate aprovado booleano, etapa pendente e dados fictícios já confirmados/temporários necessários. Não guardar CPF inicial.

- [ ] **Step 1: Escrever teste de integridade do catálogo**: exatamente 24 grupos/247 IDs funcionais, IDs únicos, destinos existentes ou explicitamente informativos, no máximo 3 ações por tela, nenhum `LEG-*` executável e apenas os três serviços aprovados no fluxo público.
- [ ] **Step 2: Rodar `pnpm --filter @seguradora/chatbot test -- assistance-catalog.test.ts`** e confirmar falha por ausência do módulo.
- [ ] **Step 3: Implementar import/conversão determinística do catálogo para tipos de domínio**, mantendo IDs e copy rastreáveis; não alterar o protótipo nem incluir chrome do atlas.
- [ ] **Step 4: Escrever testes de transição pura** para gate requerido em toda entrada pessoal, descoberta pública sem CPF, quick reply válido/obsoleto, entrada inválida e destinos de exceção/retorno.
- [ ] **Step 5: Escrever testes do parser de dependentes** para frase com nome/CPF/data/parentesco explícitos; dados ausentes, CPF malformado, frase ambígua e tentativa de inferir sexo devem deixar campos ausentes; correção deve preservar outros campos.
- [ ] **Step 6: Implementar `nextAssistanceState` e `parseDependentStatement`**, mantendo a tela de revisão e confirmação explícita como única transição de escrita.
- [ ] **Step 7: Executar os três testes de domínio e `pnpm --filter @seguradora/chatbot typecheck`**; confirmar PASS sem I/O no domínio.
- [ ] **Step 8: Atualizar `apps/chatbot/CHECKLIST.md` e commitar** como `feat(chatbot): model assistance journey catalog`.

### Task 3: Implementar validação do gate CPF-only

**Files:**
- Create: `apps/chatbot/src/domain/assistance-cpf.ts`
- Test: `apps/chatbot/src/domain/assistance-cpf.test.ts`
- Modify: `apps/chatbot/src/domain/assistance-journey.ts`
- Modify: `apps/chatbot/src/domain/assistance-journey.test.ts`

**Interfaces:**
- Produces: `parseAssistanceCpf(input: string): Result<{ normalized: string }, AssistanceCpfError>`; normalização retorna 11 dígitos, nunca faz lookup nem checksum.
- `assistance-journey.ts` recebe apenas o resultado booleano do gate para persistir a etapa; descarta o CPF inicial depois da validação e antes de chamar o mock.

- [ ] **Step 1: Testar** qualquer 11 dígitos (incluindo `00000000000`) e pontuação canônica como aceitos; 10/12 dígitos, pontuação parcial, letras, espaços internos e pontuação duplicada como rejeitados.
- [ ] **Step 2: Executar `pnpm --filter @seguradora/chatbot test -- assistance-cpf.test.ts`** e verificar falha inicial.
- [ ] **Step 3: Implementar parser puro** sem algoritmo de checksum, rede, acesso a fixture ou logs; erros devem ser valores estáveis.
- [ ] **Step 4: Ligar o parser às transições IDE-01…IDE-08**: IDE-03 diz apenas formato aceito; IDE-04 informa erro de formato; IDE-05 retoma pedindo CPF; IDE-06 exige confirmação da operação sem segundo fator; IDE-07 representa dado mock indisponível.
- [ ] **Step 5: Executar testes de CPF/jornada e `pnpm --filter @seguradora/chatbot typecheck`**; confirmar gate bloqueado até formato aceito, sem nome/identidade retornados.
- [ ] **Step 6: Atualizar checklist e commitar** como `feat(chatbot): add demonstrative cpf gate`.

### Task 4: Criar `AssistancePort` e adapter mock volátil, isolado por sessão

**Files:**
- Modify: `apps/chatbot/src/application/ports.ts`
- Create: `apps/chatbot/src/application/assistance-service.ts`
- Create: `apps/chatbot/src/infra/mock-assistance.ts`
- Create: `apps/chatbot/src/infra/mock-assistance.test.ts`
- Modify: `apps/chatbot/src/compose.ts`
- Modify: `apps/chatbot/src/compose.test.ts`

**Interfaces:**
- Produces `AssistancePort` separado de `ServicesPort`, operações tipadas para ler contexto/benefícios/documentos/dependentes/preferências e submeter operações de inclusão/correção/remoção, modalidade, cancelamento e solicitação demonstrativa.
- Toda operação usa `CallContext { correlationId, idempotencyKey }` e retorna `Promise<Result<T, AssistanceFailure>>`; mutações recebem `sessionId` e só são chamadas após confirmação final.
- Adapter inicia cópia determinística de fixture por `sessionId`, com TTL/capacidade seguindo configuração do chatbot; não persiste em DB/filesystem e não recebe CPF inicial.

- [ ] **Step 1: Escrever testes para o adapter**: sessões isoladas, fixture sem referências reais, TTL, limite de capacidade, atualização refletida em leitura posterior, erro mockado sem sucesso falso e repetição com mesma chave idempotente.
- [ ] **Step 2: Executar `pnpm --filter @seguradora/chatbot test -- mock-assistance.test.ts`** e observar falhas esperadas.
- [ ] **Step 3: Definir tipos `AssistanceFailure`, contratos de leitura e operação em `application/ports.ts`**, sem modificar `ServicesPort`.
- [ ] **Step 4: Implementar `MockAssistance` e fixtures** com dados fictícios para os três serviços e operações listadas na SPEC; a chave do repositório é `sessionId`, nunca CPF.
- [ ] **Step 5: Compor adapter em `compose.ts`** por injeção manual, preservando adapters de cotação/apólice/sinistro existentes.
- [ ] **Step 6: Rodar testes do adapter/composição, `pnpm --filter @seguradora/chatbot typecheck` e `pnpm --filter @seguradora/chatbot test`**; confirmar PASS e nenhuma dependência em fake-services existentes.
- [ ] **Step 7: Atualizar `apps/chatbot/CHECKLIST.md` e commitar** como `feat(chatbot): add session-scoped assistance mock`.

### Task 5: Orquestrar eventos, gate, Flows, áudio e operações confirmadas

**Files:**
- Modify: `apps/chatbot/src/application/handle-turn.ts`
- Modify: `apps/chatbot/src/application/handle-turn.test.ts`
- Modify: `apps/chatbot/src/application/ports.ts`
- Create: `apps/chatbot/src/application/assistance-turn.ts`
- Create: `apps/chatbot/src/application/assistance-turn.test.ts`
- Modify: `apps/chatbot/src/compose.ts` e testes de composição
- Modify: `apps/chatbot/src/infra/typed-journeys.test.ts`

**Interfaces:**
- Consumes: `AssistancePort`, catálogo e estado de domínio das Tasks 2–4.
- Produces: `runAssistanceTurn(input: AssistanceInput, deps: { port: AssistancePort; state: AssistanceState; sessionId: string; context: CallContext }): Promise<Result<AssistanceTurnResult, AssistanceFailure>>`.
- `AssistanceTurnResult` contém estado de diálogo e `ReplyBody[]`, usando apenas eventos já existentes e `message.document` da Task 1; fixtures de voz local aceitam IDs demonstrativos definidos no catálogo/testes e nunca transcrevem áudio arbitrário.

- [ ] **Step 1: Testar roteamento de `user.text`, `user.quick_reply`, `user.flow_submit` e `user.voice`**, incluindo CPF+solicitação no mesmo texto, submissão malformada e fixture de áudio total/parcial/falha.
- [ ] **Step 2: Testar que `user.flow_data_exchange` segue sem resposta/mutação**, Flow fechado sem submit não chama port e cada ID de ação é validado contra tela/estado corrente.
- [ ] **Step 3: Testar replay do mesmo `(sessionId,event.id)` e quick reply de tela anterior**: resposta reproduzida sem segunda operação; ação antiga não muda estado.
- [ ] **Step 4: Testar cada operação confirmável**: abrir/editar/revisar não chama mutação; submit final confirmado chama uma vez; leitura subsequente reflete resultado.
- [ ] **Step 5: Implementar caso de uso e conectar ao `HandleTurn`/`compose.ts`**, mantendo o caminho legado existente de intents e chamadas `ServicesPort` intacto. Não registrar conteúdo ou payload sensível.
- [ ] **Step 6: Testar `message.document` emitido somente para as três telas documentais previstas e validar cada evento com `UnsequencedServerEventSchema`**.
- [ ] **Step 7: Executar `pnpm --filter @seguradora/chatbot test`, `pnpm --filter @seguradora/chatbot typecheck` e `pnpm --filter @seguradora/chatbot build`**; confirmar PASS e regressão das jornadas legadas.
- [ ] **Step 8: Atualizar checklist e commitar** como `feat(chatbot): orchestrate assistance journeys`.

### Task 6: Renderizar `message.document` com visualizador local acessível

**Files:**
- Create: `apps/web/src/renderers/DocumentMessage.tsx`
- Create: `apps/web/src/renderers/DocumentMessage.test.tsx`
- Modify: `apps/web/src/renderers/registry.tsx`
- Modify: `apps/web/src/renderers/renderers.css`
- Modify: `apps/web/src/renderers/registry.test.tsx`

**Interfaces:**
- Consumes: `ServerEvent`/`DocumentPayload` da Task 1.
- Produces: renderer para lista `{id,title,status}`, modal local com aviso demonstrativo; abrir/fechar é apresentação local, sem evento `user.document_open`, URL externa ou PDF real.

- [ ] **Step 1: Escrever testes** para itens disponíveis/em geração, estado vazio impossível por schema, aviso demonstrativo, abrir/fechar por teclado, foco inicial/retorno, Escape e nome acessível do diálogo.
- [ ] **Step 2: Rodar teste do renderer e confirmar falha inicial.**
- [ ] **Step 3: Implementar `DocumentMessage` e CSS** alinhados aos tokens/bubble existentes e integrar no switch exaustivo de `registry.tsx`.
- [ ] **Step 4: Rodar `pnpm --filter @seguradora/web test -- DocumentMessage` e `pnpm --filter @seguradora/web typecheck`**; confirmar PASS sem abrir navegação externa.
- [ ] **Step 5: Atualizar `apps/web/CHECKLIST.md` e commitar** como `feat(web): render demonstrative document cards`.

### Task 7: Alinhar Flows e áudio demonstrativo à fonte canônica

**Files:**
- Modify: `apps/chatbot/src/domain/flows/` (novos JSONs coesos para Flows funcionais)
- Modify: `apps/chatbot/src/domain/flows-sync.test.ts`
- Modify: `apps/web/src/flows/fixtures/`
- Modify: `apps/web/src/flows/FlowSheet.tsx` e testes somente se lacuna demonstrada
- Modify: `apps/web/src/chat/Composer.tsx`, `apps/web/src/chat/useVoiceRecorder.ts` e testes
- Modify: `apps/web/e2e/` fixtures de Flow/áudio

**Interfaces:**
- Consumes: `step.id` e campos do catálogo da Task 2; finalização é `user.flow_submit` validado no chatbot.
- Produces: JSON WhatsApp Flow versionado para telas `list`, `form`, `review`; fixtures de áudio local determinísticas para os quatro IDs `audio`, sem gravação/upload de voz real.

- [ ] **Step 1: Adicionar teste de sincronização** que compara cada Flow JSON web com sua fonte chatbot e valida limite/schema/runtime; não adicionar dependência de `data_exchange`.
- [ ] **Step 2: Testar campos e transições Flow**: validação, seleção/lista, resumo, consentimento inicialmente desmarcado quando aplicável, correção preservando campos, submit terminal único e fechamento sem submit sem mutação.
- [ ] **Step 3: Testar experiência de áudio sem permissão de microfone nem upload**, cobrindo quatro cenários cadastrados e resultados previsíveis total/parcial/falha. O usuário não pode gravar/enviar áudio arbitrário nesta demonstração.
- [ ] **Step 4: Implementar/ajustar JSONs e componentes existentes** para equivaler a textos, rótulos, ordem e campos do catálogo; usar fixture local de áudio selecionada pelo estado de demonstração, não controle de inspeção do atlas.
- [ ] **Step 5: Executar `pnpm --filter @seguradora/chatbot test -- flows-sync.test.ts`, `pnpm --filter @seguradora/web test -- FlowSheet` e `pnpm --filter @seguradora/web typecheck`**; confirmar sincronização e nenhum request de mídia.
- [ ] **Step 6: Atualizar checklist dos serviços envolvidos e commitar** como `feat(web): align assistance flows and audio fixtures` (coordenar propriedade de paths e quebrar em commits por dono se necessário).

### Task 8: Proteger privacidade no histórico persistido

**Files:**
- Modify: `apps/web/src/chat/persistence.ts`
- Modify: `apps/web/src/chat/persistence.test.ts`
- Modify: `apps/web/src/chat/useChat.ts` somente se o teste exigir alteração de fronteira
- Modify: `apps/web/src/chat/useChat.test.tsx`

**Interfaces:**
- Produces: transformação privada da persistência que mascara CPF reconhecido nas mensagens de usuário antes de serializar e na restauração de histórico antigo; mantém texto original somente no estado ativo em memória.
- CPF mascarado deve ocultar todos os dígitos exceto os dois últimos; `user.flow_submit` continua guardando apenas resumo, nunca payload.

- [ ] **Step 1: Escrever teste com CPF-canário**: texto ativo retém mensagem original, valor bruto não aparece em `sessionStorage`, restauração não recupera valor bruto, padrões simples/pontuados são mascarados e texto sem CPF não muda.
- [ ] **Step 2: Testar redação de Flow submit e snapshots legados** para que a carga antiga de storage também seja saneada após leitura.
- [ ] **Step 3: Executar `pnpm --filter @seguradora/web test -- persistence.test.ts` e observar falha inicial.**
- [ ] **Step 4: Implementar mascaramento somente no caminho de serialização/restauração**, sem alterar a mensagem usada no turno atual nem logar o texto.
- [ ] **Step 5: Rodar `pnpm --filter @seguradora/web test -- persistence.test.ts useChat.test.tsx` e `pnpm --filter @seguradora/web typecheck`**; confirmar ausência de CPF-canário bruto.
- [ ] **Step 6: Atualizar checklist e commitar** como `fix(web): mask cpf in persisted chat history`.

### Task 9: Cobrir catálogo inteiro em integração e E2E

**Files:**
- Modify: `apps/chatbot/src/e2e.test.ts`
- Modify: `apps/chatbot/src/test/drive.ts`
- Modify: `apps/chatbot/src/test/harness.ts`
- Modify: `apps/web/e2e/chat.spec.ts`
- Modify: `apps/web/e2e/mock-gateway.mjs` ou criar harness integrado em `infra/`
- Modify: `infra/smoke.mjs` apenas se necessário à integração comprovada

**Interfaces:**
- Consumes: catálogo/ações e payloads finais definidos nas Tasks 1–8.
- Produces: teste automatizado que percorre os 247 IDs, confirma conteúdo/modalidade/destinos/ações e falha para ID ausente, duplicado, inalcançável ou destino runtime desconhecido; testes integrados não usam rotas fake de cotação/apólice/sinistro para assistência.

- [ ] **Step 1: Escrever teste de cobertura do catálogo** e executar para estabelecer falhas por estados ainda não roteados; relatório deve listar `step.id` e destino faltante sem PII.
- [ ] **Step 2: Adicionar cenários E2E** para serviços públicos, CPF válido/inválido, dependente em frase única→revisão/correção→confirmação, alterações persistentes na sessão, cancelamento/solicitação, áudio fixture, documentos, erro/expiração/retry.
- [ ] **Step 3: Adicionar cenários de idempotência, duas sessões isoladas e fixture indisponível**, verificando estado anterior preservado e nenhuma mutação duplicada.
- [ ] **Step 4: Executar integração web→gateway→chatbot→mock via `infra/docker-compose.yml`/harness atual**; inspecionar logs e storage com CPF-canário e confirmar ausência do valor bruto e de chamadas aos fake services não relacionados.
- [ ] **Step 5: Executar `pnpm --filter @seguradora/chatbot test`, `pnpm --filter @seguradora/web test`, `pnpm --filter @seguradora/web e2e` e smoke integrado definido pelo repositório**; corrigir até todos passarem.
- [ ] **Step 6: Atualizar checklist dos serviços e commitar** como `test: cover assistance journeys end to end`.

### Task 10: Validar fidelidade visual, responsividade e entrega

**Files:**
- Modify: `apps/web/e2e/chat.spec.ts` e/ou testes visuais específicos
- Modify: `apps/web/src/chat/chat.css`, `apps/web/src/flows/flows.css`, `apps/web/src/renderers/renderers.css` somente para diferenças comprovadas
- Modify: `apps/web/CHECKLIST.md`, `apps/chatbot/CHECKLIST.md`, `packages/protocol/CHECKLIST.md`

**Interfaces:**
- Referência: `docs/prototypes/whatsapp-experience/atlas-whatsapp.html`; a comparação cobre somente chat/Flow do cliente, nunca o navegador de exploração do protótipo.
- Produces: evidência de screenshots 390×844 e 1440×900 para os 24 grupos funcionais e seus estados principais/alternativos; verificação de 320 px sem overflow horizontal.

- [ ] **Step 1: Criar/estender teste Playwright** que mede `scrollWidth <= clientWidth` a 320 px e salva baselines/capturas nas viewports 390×844 e 1440×900 para jornadas e componentes representativos.
- [ ] **Step 2: Comparar visual e comportamento com atlas**: copy, rótulos, ordem, CTA, loading/erro/confirmado, Flow e documento; registrar divergências por ID e corrigir CSS/componentes sem alterar regra do domínio.
- [ ] **Step 3: Verificar acessibilidade** de quick replies, FlowSheet e modal documento por teclado/foco/labels, além de movimento reduzido e estados anunciados.
- [ ] **Step 4: Rodar verificações finais**: `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test`, `pnpm --filter @seguradora/web e2e` e smoke da composição local; todos devem terminar com exit code 0.
- [ ] **Step 5: Revisar `git diff --check`, checklists e WORKBOARD**; marcar `[x]` somente com código/testes/commits concluídos e encerrar cada linha somente após suas verificações.
- [ ] **Step 6: Atualizar checklist final e commitar** como `test(web): verify assistance experience fidelity`.

## Critérios de aceite da implementação

- Os 24 grupos/247 IDs previstos são alcançáveis, têm textos/ações rastreáveis ao catálogo e não expõem `LEG-*` em runtime.
- Catálogo público de produtos contém somente Telemedicina, Assistência Funeral e Assistência Farmácia; detalhes são apresentados no chat/Flow aprovado.
- Gate pessoal aceita qualquer CPF no formato aprovado, recusa formatos inválidos e não afirma autenticação/identidade.
- Operações só mutam após confirmação explícita, replay é idempotente, leituras refletem alterações na sessão e sessões diferentes/expiradas não compartilham dados.
- Documents usam evento novo estrito e visualizador local; Flows concluem por submit; áudio usa apenas fixtures sem gravação/upload real.
- Logs e persistência não contêm CPF inicial bruto ou payload de Flow; interface é utilizável/acessível nos viewports definidos.
- Testes por pacote, integração, E2E, typecheck, lint, build e smoke passam; serviços não relacionados continuam sem regressões.
