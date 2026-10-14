# Tasks 9–10 — checkpoint de retomada, 2026-10-13

Status: **em andamento; sem aceite global e sem deploy GCP**.
Branch: `feat/assistance-final-validation`; base `427ed76`; claims `addaaeb`, `f54ec13`, `73d1118`. Alterações de produto ainda sem commit neste checkpoint.

## Integração corrigida e verificada

- CPF: IDE-01 é conversa; IDE-08 tem apenas um submit terminal. IDE-02 e IDE-03 são realmente emitidos antes da retomada privada; CPF inicial não é armazenado nem ecoado. Formato continua aceitando quaisquer 11 dígitos ASCII/pontuação canônica, sem checksum/identidade.
- Frase de inclusão preservada através do gate, incluindo nome, CPF, nascimento e parentesco explícitos; dados complementares são perguntados, não inferidos. Ana Lima e João da Silva percorrem o HTTP real.
- Correção efetiva de nascimento preserva outros campos e não sobrescreve a data digitada pelo exemplo estático do catálogo.
- Respostas fora do escopo/obsoletas/indisponíveis reemitem controles atuais em vez de deixar a conversa sem ações. Conversa ativa nunca escapa para cotação/menu legado; `ServicesPort` interno continua compatível.
- Seleção de exclusão resolve o participante real da sessão, inclusive IDs opacos com vírgula; revisão/nome/CPF mascarado correspondem à pessoa selecionada. Retry não volta a Maria/João fictícios do JSON estático.
- Exclusão agendada para a data **ilustrativa** 10/11/2026 mantém vínculo até a data; confirmação para desfazer altera o agendamento e replay não duplica efeitos. Após efetivação não permite desfazer. Não é regra comercial real, nem há persistência após TTL/reinício.
- Composição padrão agora usa Maria Silva fictícia, como o cenário Familiar do atlas. Mock sem seed permanece vazio; seeds validados/clonados, sessões independentes, TTL retorna ao seed e IDs de inclusão não colidem.
- Títulos de ações acima de 20 caracteres equalizados na fonte canônica/atlas, sem remover opções ou alterar destinos. CTA de abrir Flow não usa mais a confirmação terminal.
- Smoke moderno verifica exatamente três serviços, gate, contrato, documentos reais do adapter mock e replay. Não usa cotação/apólice/sinistro como assistência.

## Evidências até este checkpoint

- Após checkpoint `dd00f93`: expiração IDE-05 e troca PLA-08 corrigidas e testadas por HTTP na fronteira TTL/compatibilidade real de participantes. Gate/draft vencidos descartados; confirmação antiga não muta; modalidade da lista preservada até revisão e participantes reconsultados. Subset101/101, suite chatbot636/636, tipos/lint/build0. Auditoria anterior233/247 precisa incluir a fixture de relógio e expectativas de incompatibilidade antes de nova contagem. Sem novos avisos/provider/deploy GCP.
- Retomada após pausa: 19/19 E2E passaram em 26,6 s após corrigir a espera inicial. Trace comprovou 429/Retry-After de 7–11 s versus expect de 5 s; limite do gateway não foi alterado. 11/11 live e 24/24 grupos também passaram na imagem anterior à última correção textual contextual.
- Auditoria atual: **233/247 IDs observados**, 14 ausentes e uma falha de transição de confirmação `PLA-08`. Log `/private/tmp/assistance-audit-resumed-final.log`. Ausentes: IDE-05, IDE-06, CAN-11, REN-09, RET-07 e NOT-01..09. O teste estrito permanece vermelho, sem whitelist; a confirmação contextual PLA/CAN foi corrigida em RED→GREEN e subset 63/63 passou. Alcance não prova todos os predicados/efeitos.
- Nova suíte serial: chatbot 633/633, gateway 177/177, protocol 93/93, resilience 63/63; web 937/938 sob build/audit concorrentes. Falha temporal conhecida `text.test.tsx > worst-case https://a.b/` levou 569 ms contra limite 500 ms. Não enfraquecer limite; repetir sem build/audit concorrentes antes de consolidar. Typecheck/lint em repetição; stack local em rebuild. Nenhum deploy GCP.
- Suíte raiz anterior à última integração do seed/máscara: `env npm_config_workspace_concurrency=1 pnpm test` passou: chatbot 618, web 938, gateway 177, protocol 93, resilience 63; verificadores Node e deploy.test.sh 52 cenários passaram.
- Tentativas com workspaces concorrentes apresentaram testes temporais preexistentes: `stream.test.ts > sends heartbeats` (160 ms) e `text.test.tsx > worst-case https://a.b/` (500 ms). Não se enfraqueceram asserções nem se editou gateway; execução serial diagnosticou a pressão de CPU. Logs `/private/tmp/assistance-final-tests-serial.log` e `/private/tmp/assistance-final-checkpoint.log`.
- Último subset após seed e IDs opacos: 28/28 (HTTP 14, fixtures 11, composição 3), `/private/tmp/assistance-canonical-selection-green.log`. Máscara pontuada da revisão RED→GREEN, 46/46 em `/private/tmp/assistance-review-mask-green.log`.
- Playwright integrado anterior ao último seed/agrupamento: 11/11; inclui frase única→CPF→revisão→inclusão→exclusão agendada→desfazer, captura DEP-06 em 320/390/1440 e EXC-03 mobile. Log `/private/tmp/assistance-checkpoint-live.log`. Deve ser repetido na imagem nova.
- Smoke real anterior ao seed 7/7, 289 ms. `deploy.sh check` exit 0; nenhum comando mutável GCP.
- `verify.mjs`: 24 jornadas/247 IDs, destinos preservados, sem LEG/OTP. Isso valida catálogo, **não alcance funcional de cliente**.

## Auditoria dos 247 IDs

Comando estrito: `pnpm --filter @seguradora/chatbot exec vitest run --config src/test/catalog-audit.config.mjs`.
Última medição anterior ao seed: **224 IDs observados / 23 ainda não observados**, sem failures de transição nem rótulos emitidos acima de 20. `/private/tmp/assistance-catalog-context.log`.

O driver foi corrigido para distinguir revisão vazia, complemento sem identidade e identidade completa; preservar caminhos completos; observar mensagens intermediárias realmente emitidas; e tentar enunciados únicos posteriores. Usa HTTP/user.text/choice/Flow/voice, sem abrir IDs via rota debug, injetar estado ou whitelist. Renderização por enunciado ilustrativo não comprova sozinha predicado do mock nem todos os efeitos de operação.

IDs ainda não observados: ENT-03, ENT-05, ENT-07, ENT-08, IDE-04, IDE-05, IDE-06, ADE-12, CON-03, PLA-07, CAN-06, CAN-11, REN-09, RET-07, NOT-01, NOT-02, NOT-03, NOT-04, NOT-05, NOT-06, NOT-07, NOT-08, NOT-09.

Parte é lacuna do driver (CPF inválido/entradas repetidas), parte exige condições de fixture/entrada de sistema ainda ausentes. Avisos NOT-01..09 não têm enunciado de usuário nem controle de entrada no catálogo. Não preencher essa lacuna com seleção de IDs pelo cliente, CPF como seletor de cenário ou falsa cobertura.

## Fidelidade — progresso, não aceite

- FlowSheet branco, paleta/raio/cabeçalho/nota alinhados ao atlas; foco/Escape/movimento reduzido e overflow verificados no subset.
- Revisões em seções com rótulo/valor em colunas, valores dinâmicos e nascimento DD/MM/AAAA; máscara pontuada igual à referência.
- Texto/quick replies da mesma resposta agrupados em uma bolha, preservando o event.id original para responder; turnos distintos não se agrupam; eventos/storage não são modificados.
- Bold com dois asteriscos do catálogo passa a ser renderizado, não exposto como marcadores.
- Instruções LIST antes ocultas por CSS genérico voltaram a ficar disponíveis visualmente e na árvore acessível.
- Testes de captura por 24 grupos em `assistance-groups.config.ts` passaram 24/24 em 320/390/1440 px (`assistance-groups-live.log`). NOT-10 é exemplo de aviso antigo, não substitui prova de avisos proativos. Comparação completa dos 247 estados continua pendente.
- Há limitações a resolver: reviews locais adicionais em alguns formulários, leitura dinâmica de todas as listas/resumos e representação das condições alternativas. Não alegar 100% fidelidade.

## Revisão independente

Zeno separou erros de driver e runtime; seus achados orientaram contextos de revisão, seleção e emissão IDE-02. Popper apontou retomada pós-CPF sem hidratação, nomes Maria corrompidos e ocultação genérica de texto LIST. Os três foram reproduzidos e corrigidos em RED→GREEN. Revisor não aprovou suíte raiz/247 IDs, validade comercial das datas, comparação visual completa ou privacidade/idempotência além do escopo; essas dimensões seguem sujeitas à verificação específica do controlador.

## Próximos passos

1. Finalizar rebuild, repetir 11 cenários e smoke na imagem atual; executar captura representativa dos 24 grupos e corrigir divergências comprovadas.
2. Repetir typecheck/lint/build/suíte raiz/E2E padrão após última integração; atualizar checklist e salvar commit **parcial**, sem marcar Tasks 9/10 completas.
3. Complementar condições/entradas mockadas dos estados faltantes sem alterar jornadas/clientes nem introduzir provider real; registrar decisões contra a SPEC antes de mudar interfaces/transporte.
4. Somente após aceite: integração final e Task 11 (GCP + vídeo executivo único com voz feminina, capítulos e pausas humanas). Não há vídeo executivo nem deploy desta versão.
