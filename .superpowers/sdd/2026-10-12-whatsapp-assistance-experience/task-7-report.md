# Task 7 — WhatsApp Flows e áudio demonstrativo

Data: 2026-10-13. Estado: implementação concluída; revisão round 1 corrigiu os dois achados Important e o Minor.

## Decisão de arquitetura

Cada estado `list`, `form` ou `review` do catálogo continua sendo um `flowId` e um turno do chatbot. Os 46 JSONs versionados em `apps/chatbot/src/domain/flows/` são a fonte canônica; `apps/web/src/flows/fixtures/` contém cópias exatas. Formulários com campos têm uma revisão local e retorno que preserva os valores antes do único `user.flow_submit`. A revisão do estado seguinte pertence ao chatbot e confirma a operação apenas no submit próprio. Essa separação mantém a validação e o estado do servidor existentes, sem `user.flow_data_exchange`.

Os quatro cenários `audio` são `AUD-01` (compreensão completa), `AUD-03` (parcial), `AUD-04` (falha) e `AUD-05` (compreensão com revisão). O Composer do demonstrador só oferece esses IDs e produz um WAV tonal local determinístico para a bolha. `user.voice.mediaId` leva o ID do cenário; o chatbot já restringe os IDs. A função de gravação real existente permanece fora da rota de `ChatScreen`.

## Arquivos

- Chatbot: `src/domain/flows/{generate.mjs,index.ts,*.flow.json}` (46 novos JSONs), `src/domain/flows-sync.test.ts`, `src/application/assistance-turn.ts` e seu teste, `CHECKLIST.md`.
- Web Flows: 46 cópias em `src/flows/fixtures/`, `src/flows/FlowSheet.test.tsx`, `CHECKLIST.md`.
- Web chat/E2E: `src/chat/{ChatScreen.tsx,ChatScreen.test.tsx,Composer.tsx,chat.css,demo-audio.ts,useChat.ts,useChat.test.tsx}`, `e2e/{chat.spec.ts,mock-gateway.mjs}`.
- Nenhum arquivo do WORKBOARD foi editado. O `task-1-report.md` já modificado por outra frente foi preservado e não entrou nos commits.

## TDD — RED

- `pnpm --filter @seguradora/chatbot test -- flows-sync.test.ts`: `missing Flow JSON: .../ENT-06.flow.json`.
- `vitest run src/application/assistance-turn.test.ts`: o chatbot devolvia `step.flow` bruto em vez de JSON versionado; correção `CAD-03` ficava em `CAD-03`; `DES-07` aceitava a opção placeholder `Selecione`.
- `vitest run src/flows/FlowSheet.test.tsx -t 'reviews a catalog form'`: após “Revisar pedido”, o valor `Rua A, 1` não aparecia em uma tela de revisão.
- `vitest run src/chat/ChatScreen.test.tsx -t 'offers four deterministic'`: botão “Áudio demonstrativo” ausente; o chat oferecia “Gravar áudio”. `vitest run src/chat/useChat.test.tsx -t 'sends local fixture'`: quatro casos falharam com `sendDemoVoice is not a function`.
- Playwright inicial (15 casos): 14 passaram e o novo caso de áudio falhou porque a resposta “Recebi seu áudio” não veio do gateway simulado.
- Teste de sincronização detectou `{{name}}` não resolvido em `DEP-06`; o JSON agora mascara placeholders de dados pessoais.

## GREEN e revisão

- `pnpm --filter @seguradora/chatbot test -- flows-sync.test.ts`: 24 arquivos, 583/583 testes passaram, incluindo sincronização, schema, runtime, seleção de lista e correção sem mutação.
- `pnpm --filter @seguradora/web test -- FlowSheet`: 46 arquivos, 650/650 testes passaram na repetição sem carga paralela. A primeira execução teve 649/650: o teste preexistente de custo de renderização em `src/flows/components/text.test.tsx` mediu 573 ms para um limite de 500 ms enquanto build/typechecks/lint rodavam em paralelo. Isolado, esse arquivo passou 15/15; na repetição da suíte completa, o caso mediu 357 ms e todos passaram.
- Playwright focalizado `CI=1 pnpm --filter @seguradora/web exec playwright test -g 'offers four local demo audio outcomes'`: 1/1 passou. O teste intercepta pedidos de mídia, faz `getUserMedia`/`MediaRecorder` lançarem erro se usados, envia os quatro IDs e verifica cada resposta canônica. O teste unitário da tela confirma que `useVoiceRecorder` não é chamado; o hook de envio cria apenas `Blob` WAV local e `blob:` URL, sem `fetch`.
- `pnpm --filter @seguradora/web typecheck`, `pnpm --filter @seguradora/chatbot typecheck`, `pnpm --filter @seguradora/chatbot build`, ESLint dos arquivos alterados e `git diff --check`: passaram. Revisão do diff: somente caminhos chatbot, web-flows, web-chat e este relatório foram alterados por esta tarefa.

## Commits

- `ea46ceb feat(chatbot): serve catalog-aligned assistance flows`
- `5c32dbd feat(web): align assistance flows and demo audio fixtures`

## Limitações da entrega inicial (resolvidas no round 1)

- Revisões do catálogo com valores provenientes de um Flow anterior mostram rótulos na ordem canônica, mas mascaram os valores dinâmicos como `••••`, pois os dados anteriores não são entregues ao novo `FlowSheet` sem expô-los no evento que o chat pode persistir. A correção preserva `temporaryData` no chatbot, e voltar na revisão local preserva campos, mas abrir um novo formulário de correção não pré-preenche os campos anteriores. Portanto a revisão visual entre passos ainda não permite conferir valores reais; precisa de passagem de rascunho volátil e restrita à sessão antes de considerar fidelidade completa.
- O WAV local é um tom identificador, não fala gravada. Os resultados são demonstrativos e determinados pelo ID, sem transcrição.
- `git pull --ff-only` foi tentado antes das alterações e falhou com `Operation not permitted` ao escrever `FETCH_HEAD` no gitdir compartilhado do worktree. Não houve pull nem alteração do WORKBOARD; a base de trabalho permaneceu a branch existente com as reivindicações já confirmadas pelo usuário.

## Fix round 1 — revisão/correção segura e defaults do catálogo

### Decisões e segurança

- O contrato `message.flow` ganhou `initialData` opcional, validado com intenção explícita (`review`/`correction`), no máximo 20 valores e valores string/boolean limitados. O draft é produzido somente ao entrar em uma revisão após submit de formulário ou ao entrar explicitamente em correção, e somente dentro da mesma jornada. Dados antigos de outra jornada não são anexados.
- `FlowMessage → OpenFlowRequest → FlowSheet → useFlowSheet → useFlowRuntime` transporta `initialData` em memória. Valores comuns continuam visíveis. Revisões server-fed recebem `maskedDocument` derivado (somente os dois últimos dígitos); o CPF cru pode ser encaminhado apenas para um campo sensível de uma correção explícita. O Flow local de formulário sempre usa placeholder fixo `••••` para CPF, mesmo após o campo ser editado, então não exibe valor cru nem máscara derivada obsoleta. JSON estático contém apenas referências/placeholder, nunca valor de usuário.
- `saveChat` remove `initialData` de mensagens de Flow, e `loadChat` também remove esse campo de saves legados. Testes com `CPF-CANARY-98765432100` verificam ausência em ambos os caminhos. Não se adicionou log de payload nem `data_exchange`.
- O gerador preserva `checked` em preferências (PRE-02 `optionalDocs=true`, `optionalBenefits=false`); consentimento permanece explicitamente desmarcado. Os fixtures chatbot/web foram regenerados e a sincronização os compara.
- Task 7 só voltou a `[x]` nos checklists após a validação final. O checklist do protocolo foi atualizado no commit do protocolo. WORKBOARD não foi editado; o `task-1-report.md` preexistente permaneceu fora do staging.

### TDD — RED/GREEN do round 1

- RED contrato: teste de intenção inválida falhou porque `message.flow` aceitava `initialData.intent='other'` (53/54 eventos passaram).
- RED persistência: dois testes falharam com o canário presente tanto no save quanto no load legado.
- RED defaults: teste do PRE-02 falhou (`optionalDocs` gerado como `false`, esperado `true`).
- RED revisão: o FlowSheet mostrava `••••` em CEP/endereço/cidade; o teste integrado ainda não encontrava valores dinâmicos. RED adicional do `DEP-05`: após editar CPF, a revisão local renderizava `CPF: 12345678900`, não o placeholder esperado.
- GREEN contrato: `src/events.test.ts` 54/54. GREEN persistência + renderer: 17/17. GREEN chatbot required `pnpm --filter @seguradora/chatbot test -- flows-sync.test.ts`: 24 arquivos, 588/588. GREEN web required `pnpm --filter @seguradora/web test -- FlowSheet`: 46 arquivos, 655/655. GREEN áudio focalizado: 5 testes selecionados passaram; Playwright `offers four local demo audio outcomes...`: 1/1.
- GREEN de validação: typecheck protocol, chatbot e web; lint focado; `git diff --check`; teste de integração da sequência form → review → correction → review/confirm verifica preservação dos demais campos, nenhuma mutação na correção e exatamente uma chamada terminal.
- Revisão de mídia: `apps/web/src/chat/demo-audio.ts`, `useChat.ts` e `Composer.tsx` não contêm APIs de microfone/gravação nem requisições de mídia; Playwright anterior intercepta rede e torna `getUserMedia`/`MediaRecorder` fatais no demonstrador.

### Alterações deste round

- Protocol: `packages/protocol/src/payloads.ts`, `src/events.test.ts`, `CHECKLIST.md`.
- Chatbot: `src/application/assistance-turn.ts` e teste, gerador e Flows canônicos afetados, teste de sincronização, `CHECKLIST.md`.
- Web Flows: runtime/FlowSheet/hook, fixtures sincronizados, teste FlowSheet e `CHECKLIST.md`.
- Web chat: `src/chat/persistence.ts` e testes; renderer/host e teste de passagem do `initialData`.
- Não foi adicionado novo Playwright para a sequência multi-turn de correção; ela é coberta por teste de aplicação do chatbot e FlowSheet integrado. O E2E Playwright foi repetido para os quatro cenários de áudio.

### Commits round 1

- `5f44ecf fix(protocol): validate volatile Flow initial data`
- `49d1c60 fix(chatbot): hydrate safe assistance flow reviews`
- `fb4da39 fix(web-flows): hydrate review and correction screens`
- `7605e91 fix(web-chat): keep Flow drafts out of history`

### Autorrevisão e ressalvas

- Revisado o diff commit a commit: protocol toca somente contrato/teste/checklist; chatbot contém projeção e estado de jornada, gerador, cópias canônicas/testes/checklist; web-flows contém runtime/FlowSheet/fixtures/teste/checklist; web-chat contém apenas persistência/testes e passagem do renderer. Nenhum arquivo do WORKBOARD foi tocado.
- `task-1-report.md` já estava modificado antes deste round e não foi staged nem incluído nos commits. O relatório Task 7 está sendo incluído em commit próprio; `.superpowers/sdd/.gitignore` ignora relatórios, portanto será adicionado explicitamente sem alterar a regra global.
- Ressalva: não foi criado um Playwright cross-step novo para a sequência completa; essa sequência é testada por chamadas multi-turn reais de `runAssistanceTurn` com assert de mutação única e pelo FlowSheet integrado. Playwright foi repetido para áudio (1/1). O restante está coberto pelos testes de integração/unitários acima.
