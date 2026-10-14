# SPEC — Experiência conversacional de assistências no simulador WhatsApp

Data: 2026-10-12  
Status: proposta detalhada aprovada para redação; aguardando revisão do documento  
Escopo: simulador web existente, chatbot determinístico e dados demonstrativos em memória

## 1. Objetivo

Implementar no produto deste repositório a experiência conversacional aprovada no protótipo UX, cobrindo exclusivamente estes serviços:

1. **Telemedicina**.
2. **Assistência Funeral**, com suporte ao titular e dependentes.
3. **Assistência Farmácia**, com descontos em redes credenciadas.

A experiência deve ser acessada pela aplicação web existente, que simula a conversa e os componentes visuais do WhatsApp. O chatbot conduz jornadas determinísticas, apresenta mensagens e Flows equivalentes aos estados do protótipo e usa um adapter mock para leituras e operações. A SPEC não autoriza integração com a WhatsApp Cloud API, atendimento real, cobrança, consulta real de cadastro ou processamento de dados em serviço externo.

O critério central é a rastreabilidade e fidelidade dos **247 estados funcionais** do protótipo: identificadores, conteúdo, regras, transições e composição visual precisam ter correspondência verificável na implementação. Não se deve criar telas, coberturas, valores, prazos, disponibilidade de prestadores ou regras comerciais que não estejam aprovados nas fontes.

## 2. Fontes de verdade e precedência

Usar as fontes existentes no repositório nesta ordem:

1. Esta SPEC: decisões de escopo e arquitetura, além das duas exceções aprovadas descritas abaixo.
2. `docs/prototypes/whatsapp-experience/catalog.js`: fonte canônica dos IDs, jornadas, conteúdo conversacional, decisões, regras, ações e destinos, exceto comportamento/copy do grupo `IDE`, substituído pela seção 7.1.
3. `docs/prototypes/whatsapp-experience/atlas-whatsapp.html`: referência visual independente do protótipo, incluindo bolhas, cartões, documentos, áudio e apresentação dos Flows.
4. `docs/prototypes/whatsapp-experience/README.md` e `VERIFICATION.md`: limites conhecidos, decisões aprovadas e verificações já feitas.

Se a implementação encontrar contradição entre uma tela e uma regra, deve preservar as decisões desta SPEC e registrar a divergência para revisão, sem inventar comportamento. Além da exceção CPF-only para `IDE`, a nomenclatura neutra “Serviços de Assistência” nas telas de gestão é a outra adaptação autorizada, já refletida no protótipo. Alterações posteriores de conteúdo ou jornada devem primeiro atualizar o catálogo de UX e sua verificação; não manter cópias divergentes de textos e transições em locais independentes.

O catálogo atualmente contém 25 grupos e 281 estados. A implementação funcional usa os 24 grupos abaixo, totalizando 247 estados. Os 34 estados do grupo `LEG` continuam acessíveis apenas como referência histórica/visual do comparativo e **não** entram no catálogo de execução, no menu do cliente ou na máquina de estados do chatbot.

| Código | Jornada | Estados |
|---|---|---:|
| `ENT` | Entrada e orientação | 9 |
| `FAQ` | Central de dúvidas | 5 |
| `NAV` | Menu por necessidades | 4 |
| `IDE` | Identificação e sessão | 8 |
| `AUD` | Entrada por áudio | 6 |
| `DES` | Descoberta e comparação | 14 |
| `ADE` | Contratação | 13 |
| `PAG` | Pagamento da contratação | 10 |
| `CON` | Meu contrato e documentos | 11 |
| `DEP` | Incluir e corrigir dependentes | 34 |
| `EXC` | Excluir dependentes | 14 |
| `PLA` | Troca de plano | 13 |
| `CAD` | Atualização cadastral | 4 |
| `UTI` | Utilizar benefícios | 10 |
| `FUN` | Assistência Funeral | 10 |
| `COB` | Cobrança e regularização | 14 |
| `CAN` | Cancelamento e restituição | 14 |
| `FIM` | Encerrar conversa | 2 |
| `REN` | Renovação e continuidade | 9 |
| `SOL` | Minhas solicitações | 10 |
| `HUM` | Atendimento humano | 12 |
| `RET` | Pausa e retomada | 8 |
| `NOT` | Avisos de serviço | 10 |
| `PRE` | Preferências de comunicação | 3 |
| **Total funcional** | **24 jornadas** | **247** |

O catálogo inclui cenários ilustrativos de contratação, planos, cobrança, datas, valores, contratos e protocolos. Eles são fixtures para UX e teste, não termos comerciais aprovados. Só os três serviços citados no objetivo podem ser apresentados como serviços oferecidos. Contrato, dependentes, pagamentos, documentos, solicitações, preferências e suporte são operações de gestão, não novos serviços/benefícios.

## 3. O que já existe no repositório

O desenvolvimento deve estender as fronteiras presentes, sem criar uma aplicação paralela:

- `apps/web`: React/Vite, chat, `MessageList`, registry de renderizadores, `ChatClient`, SSE/POST, persistência local e `FlowSheet` que interpreta Flows JSON.
- `apps/gateway`: sessão web, validação de eventos, SSE, fila por sessão e encaminhamento para `POST /v1/chat/events` no chatbot.
- `apps/chatbot`: Fastify, `HandleTurn`, diálogo por sessão, `DialogStore`, `TurnLog`, `MockLlmProvider`, `ServicesPort` e composição manual em `main.ts`/`compose.ts`.
- `packages/protocol`: schemas Zod compartilhados para eventos cliente/servidor, texto, quick replies, voz, template e Flow.
- `packages/resilience`: políticas de resiliência usadas pelos clientes HTTP existentes.
- `infra/docker-compose.yml` e `infra/fake-services`: execução local. O fake atual representa cotação, apólice e sinistro; não é uma API de assistências.

Os contratos em `docs/superpowers/specs/2026-10-10-gateway-chatbot-contract.md` e `docs/superpowers/specs/2026-10-10-internal-services-contracts.md` permanecem as referências para os contratos existentes. As rotas de cotação, apólice e sinistro não devem ser reutilizadas nem semanticamente renomeadas como operações de assistência. Os apps `svc-cotacao`, `svc-apolice` e `svc-sinistro` ficam fora da implementação desta entrega.

## 4. Arquitetura-alvo e responsabilidade por componente

```text
apps/web (React, conversa e FlowSheet)
        │ eventos de cliente via POST / SSE
        ▼
apps/gateway (sessão, validação, ordenação e transporte)
        │ POST /v1/chat/events + NDJSON
        ▼
apps/chatbot (jornadas e regras determinísticas)
        ├── domain: estados, validação pura e transições
        ├── application: casos de uso e AssistancePort
        └── infra: adapter mock, fixtures e armazenamento por sessão
```

### 4.1 Web — `apps/web`

- Continuar sendo cliente de apresentação e interação; não decidir elegibilidade, autenticação, sucesso de operação, estado contratual ou roteamento de jornada.
- Renderizar eventos do backend por meio do registry existente. Implementar o renderer acessível de `message.document` conforme a seção 6.
- Usar os renderers existentes para texto, quick replies, voz e mensagens de template; usar `FlowSheet` para os Flows JSON recebidos.
- Enviar `user.text`, `user.quick_reply`, `user.voice` e `user.flow_submit` conforme os tipos do protocolo. `user.flow_data_exchange` não será requisito desta entrega.
- Tratar conteúdo de CPF de forma compatível com a seção 7. Não colocar payload de Flow ou CPF bruto em resumo persistido, logs de frontend ou telemetria.

### 4.2 Gateway — `apps/gateway`

- Permanecer como fronteira HTTP existente entre a web e o chatbot.
- Preservar sessão, ordenação FIFO por sessão, idempotência, SSE/NDJSON, limites, validação e códigos de erro existentes.
- Só alterar o gateway se a integração de um tipo novo do protocolo exigir uma mudança no encaminhamento. `message.document` é um evento servidor→cliente e, no desenho atual, percorre o mesmo fluxo NDJSON/SSE sem rota nova.

### 4.3 Chatbot — `apps/chatbot`

- Conduzir as 24 jornadas funcionais com uma máquina de estados determinística por sessão. O estado precisa conter, no mínimo, `journeyId`, `screenId`, autenticação demonstrativa por formato, etapa pendente, opção selecionada e dados confirmados necessários às operações seguintes.
- Separar transições puras e modelos em `domain`, casos de uso e ports em `application`, e mock/armazenamento/serialização em `infra`.
- Adicionar uma porta `AssistancePort` em `application/ports.ts` (ou módulo coeso equivalente). Casos de uso dependem da porta; o domínio não conhece HTTP, filesystem, Fastify ou o adapter mock.
- Manter `ServicesPort` e `HttpServices` atuais para as capacidades de cotação, apólice e sinistro que já existem, sem misturar operações de assistência.
- Usar `MockLlmProvider`/parser determinístico apenas como tecnologia demonstrativa; não chamar modelo externo. A saída do parser nunca confirma nem altera um dado sem etapa de revisão/confirmação prevista no catálogo.
- Compor dependências manualmente em `apps/chatbot/src/main.ts`/`compose.ts`, de acordo com o padrão do serviço.

### 4.4 Protocolo — `packages/protocol`

- Manter Zod como fonte única dos tipos de evento e validar nas duas bordas.
- Acrescentar o evento servidor→cliente `message.document`, conforme seção 6. Esta é a única nova família de evento aprovada neste desenho; não é necessário adicionar `user.document_open`, pois abrir/fechar a visualização é uma interação local de apresentação.
- Preservar a compatibilidade de envelopes e identificadores do contrato atual. Atualizar tipos inferidos, schema discriminado, exports necessários, testes de contrato e fixtures que cobrem consumidores.
- O workstream proprietário de `packages/protocol` deve ser coordenado pelo WORKBOARD antes de implementação; esta SPEC não reivindica propriedade desse caminho.

## 5. Jornadas, interações e rastreabilidade

### 5.1 Regras gerais

- Toda jornada que consulte ou altere dado pessoal/contratual exige antes o gate de CPF da seção 7, inclusive entrada por áudio, links diretos, retomada após expiração e transições vindas do menu.
- Conteúdo público/informativo de descoberta e FAQ pode ser exibido sem CPF, conforme `requiresAuth` no catálogo; passar pelo gate CPF não é pré-requisito para conhecer os três serviços.
- O servidor valida destino e estado corrente em toda escolha. Quick reply antigo, repetido ou pertencente a outra sessão não pode avançar nem alterar dados.
- As transições e variantes (`main`, exceção, indisponibilidade, correção, retorno, pausa e retomada) vêm do catálogo e devem ter testes; não basta implementar somente o caminho feliz.
- A experiência de dependentes precisa manter a interação de frase única do estado `DEP-33`: extrair nome, CPF, nascimento e parentesco explicitamente informados; depois perguntar celular e sexo biológico e levar os dados a revisão em `DEP-06`. Nunca inferir sexo/gênero. Correções devem alterar somente o campo pedido e preservar os demais dados já confirmados.

### 5.2 Correspondência dos modos do catálogo

| Modo no catálogo | Quantidade funcional | Apresentação no produto |
|---|---:|---|
| `chat` | 195 | Mensagem `message.text`; ações do catálogo viram `message.quick_replies` com o mesmo texto e destino. Cada tela atual tem no máximo três ações e os títulos devem respeitar os limites do schema/provedor. |
| `list` | 21 | `message.flow` e Flow JSON com lista navegável/seleção; apresentar rótulo, detalhe, seleção e retorno conforme a tela do catálogo. |
| `form` | 10 | `message.flow` e Flow JSON com os campos, validação, obrigatoriedade, rótulos e navegação da fonte canônica. |
| `review` | 14 | `message.flow` de revisão com os mesmos valores/resumos, aceite explicitamente desmarcado quando aplicável, confirmação e correção conforme catálogo. |
| `audio` | 4 | Áudio de fixture enviado pelo usuário (`user.voice`) para cenários demonstrativos de compreensão total, parcial ou falha; não é áudio sintetizado pelo bot. |
| `document` | 3 | `message.document`: cartão demonstrativo que abre visualizador local acessível, sem URL externa ou arquivo contratual real. |

Os textos, rótulos, ordem, limites e destinos devem ser rastreáveis a `step.id`. Nenhuma opção do catálogo pode desaparecer silenciosamente: em um estado que não possa ser representado pelo componente atual, a implementação deve propor uma extensão de protocolo/UI antes de substituir ou remover a interação.

### 5.3 WhatsApp Flows

- **Alteração aprovada em 2026-10-13 — descoberta unificada `DES-01`:** “Conhecer produtos” permanece em um único Flow durante serviços, detalhes, planos/comparação e condições. O JSON contém as telas internas `LIST` → `DETAILS` → `PLANS` → `CONDITIONS` → `FINISH`; somente `FINISH` é terminal. Os textos de `DES-12` a `DES-14` continuam referências do catálogo, mas a navegação iniciada em `DES-01` não volta ao chat para apresentar esses detalhes.
- “Voltar” usa o histórico interno do Flow e preserva serviço, plano e intenção, inclusive escolhas feitas antes de avançar. Individual e Familiar têm igual destaque, sem opção inicialmente selecionada, e preços/composição expressamente demonstrativos. Nenhuma navegação intermediária envia evento ao chatbot ou executa operação.
- O único envio final de `DES-01` é validado estritamente como `{ intent: 'finish' | 'contract', service: '0' | '1' | '2', modality: 'individual' | 'familiar' }`. `finish` conclui em `DES-11`; `contract` inicia `ADE-01`, com gate de CPF obrigatório quando a sessão não estiver liberada. A modalidade escolhida permanece até a revisão da contratação; Individual não oferece a etapa de dependentes. Não aceitar o antigo envio parcial `{ choice }`, um destino arbitrário nem autorização de operação no payload de descoberta. Iniciar contratação não contrata nem cobra.
- Listas, formulários e revisões usam os componentes já implementados no `FlowSheet` sempre que o schema/runtime existente os cobre.
- Definições Flow ficam versionadas como JSON próximo ao catálogo de domínio do chatbot, seguem o schema do runtime e os limites da Meta documentados no repositório.
- Toda coleta termina em `complete`/`user.flow_submit`; as transições entre telas dentro do Flow são locais ao Flow JSON. Não depender de `data_exchange`, pois o chatbot atual o trata como turno vazio e a web avança localmente sem decisão servidor→cliente.
- Payload final é mínimo, validado no chatbot e não echoado integralmente ao histórico. Valores sensíveis são marcados como `sensitive` no Flow quando suportado; o resumo apresenta CPF mascarado.
- Enviar apenas dados de campos e IDs necessários; não serializar arquivo, áudio, CPF inicial ou estado inteiro da sessão em Flow JSON.

### 5.4 Áudio demonstrativo

- Os quatro estados `audio` do catálogo representam entrada de voz do usuário. Usar mídia local demonstrativa e cenário identificável para teste, de modo que cada fixture retorne o resultado previsto no catálogo.
- Não gravar nem fazer upload de áudio real, não chamar serviço de transcrição, e não inferir uma intenção a partir de áudio arbitrário nesta entrega.
- O chatbot responde aos cenários pré-definidos de entendimento, entendimento parcial e falha com os textos e opções da fonte. A pessoa pode continuar por texto ou pedir atendimento humano quando indicado.

### 5.5 Exceção aprovada: jornada `IDE` CPF-only

Manter os oito IDs `IDE-01` a `IDE-08` para rastreabilidade e cobertura, mas substituir os textos e o comportamento baseado em código da fonte:

| ID | Comportamento de implementação |
|---|---|
| `IDE-01` | Explica que é necessário informar CPF em formato válido para abrir a demonstração; não menciona envio de código nem verificação de identidade. A ação leva a `IDE-08`. |
| `IDE-02` | Estado demonstrativo de recebimento/validação do CPF, sem campo de código. Segue para `IDE-03` se o formato for aceito ou `IDE-04` se inválido. |
| `IDE-03` | Confirma apenas que o formato foi aceito. Não exibe identidade, titularidade ou nome inferido do CPF; pode informar que os dados seguintes são do cenário fictício. |
| `IDE-04` | Erro de formato/quantidade de dígitos, preserva o pedido e oferece nova entrada via `IDE-08` ou ajuda. Não é erro de código. |
| `IDE-05` | Sessão demonstrativa expirada; solicita o CPF novamente via `IDE-08`. Nenhuma confirmação por código. Dados só permanecem enquanto o estado volátil da sessão existir. |
| `IDE-06` | Confirmação explícita da ação solicitada (por exemplo, cancelamento), sem segunda autenticação. A confirmação do CPF não substitui o aceite explícito da operação. |
| `IDE-07` | Informa que o cenário mockado não tem o dado/contrato solicitado e oferece suporte; não afirma divergência de identidade ou vínculo real. |
| `IDE-08` | Único formulário de CPF, aceitando qualquer valor no formato definido na seção 7.1; após submit segue pelo resultado descrito em `IDE-02`/`IDE-03` ou `IDE-04`. |

Esta adaptação mantém todos os IDs, mas substitui copy/regra que prometia OTP, cadastro localizado ou identidade verificada. Não implementar código demonstrativo, entrega de código, opção “já tenho código” ou segundo fator.

### 5.6 Documentos demonstrativos

`message.document` deve ter schema estrito em Zod, no mínimo com lista de itens `{ id, title, status }`, onde `status` diferencia documento disponível e em geração. O renderer web exibe cartão e modal com aviso claro de conteúdo demonstrativo; a ação de abrir/fechar modal é local, acessível por teclado e não envia novo evento. Não criar PDF contratual, URL externa ou documento que pareça juridicamente válido. IDs e nomes vêm da fixture/contexto da jornada.

## 6. Mock de dados, consistência e operações

### 6.1 Adapter mock

- Implementar um adapter de `AssistancePort` em `apps/chatbot/src/infra`, alimentado por fixtures TypeScript/JSON e um repositório em memória com capacidade e TTL configuráveis por sessão.
- O adapter mock é substituível por um adapter HTTP futuro sem alterar estados de domínio, contratos conversacionais ou renderers. Nenhum serviço real é criado nesta entrega.
- Dados iniciais são determinísticos e fictícios: situação contratual, modalidade demonstrativa, participantes, três benefícios, cobrança/regularização, documentos, solicitações, preferências e disponibilidade ilustrativa.
- Toda mensagem deve evitar prometer condições não aprovadas. Disponibilidade de rede/prestador, preços, vigência, limites, carências, restituição e prazo devem ser apresentados como demonstração ou depender de fixture explícita, nunca como regra real.

### 6.2 Estado mutável por sessão

- A chave de isolamento é `sessionId` fornecido pelo gateway, nunca CPF. Sessões diferentes recebem cópias independentes das fixtures e não compartilham alterações.
- Durante a sessão ativa, leituras refletem escritas confirmadas: dependente incluído aparece em lista/resumo; remoção, plano alterado, solicitação, cancelamento e preferência atualizados são vistos nas consultas seguintes.
- Nenhuma mutação ocorre ao abrir formulário, escolher uma opção provisória ou ver a revisão. Alterar o estado somente depois da confirmação explícita final da tela/jornada.
- Pagamento, renovação, cancelamento, restituição, contato humano e solicitação são simulações locais. Não há cobrança, Pix/cartão, transferência de dados a parceiro, envio real de documento, abertura de ticket em operação externa ou efeito contratual real.
- Operações retornam `Result` com erros esperados como valores, protocolos demonstrativos e estado atualizado. Falha mockada não deve ser representada como sucesso.
- Resend/retry do mesmo evento deve ser idempotente por `(sessionId, event.id)`/`Idempotency-Key`, reaproveitando o resultado anterior e sem duplicar dependente, protocolo ou operação.
- As alterações existem apenas enquanto o estado volátil da sessão existir. Expiração, perda/reciclagem do processo ou reinício apaga os mocks; sem banco, filesystem persistente, local storage de domínio ou compartilhamento entre sessões.

### 6.3 Responsabilidades da porta

`AssistancePort` deve cobrir apenas casos necessários pelas jornadas do catálogo, agrupados por operações tipadas, como: consulta do contexto e contrato demonstrativos; leitura de benefícios e documentos; listar/incluir/corrigir/remover dependentes; trocar/renovar/cancelar modalidade; consulta/regularização demonstrativa de cobrança; dados cadastrais e preferências; criar/consultar solicitações e encaminhamentos humanos demonstrativos. Evitar uma API genérica `execute(action, object)` que retire validação estática e regras do domínio.

Validar inputs em bordas com Zod e regras puras no domínio. Usar erros estáveis de domínio/application para inexistência, conflito de estado, validação, limite de sessão e indisponibilidade simulada. A camada de UI nunca escolhe diretamente o resultado de uma operação.

## 7. CPF, privacidade e limite de segurança

### 7.1 CPF como gate demonstrativo

- O CPF não autentica nem identifica de fato a pessoa. Ele é somente uma condição demonstrativa para liberar jornadas pessoais no simulador.
- Aceitar qualquer sequência com 11 dígitos, em forma simples (`ddddddddddd`) ou pontuada canônica (`ddd.ddd.ddd-dd`). Normalizar para dígitos antes das operações de formato. Não validar dígitos verificadores, existência, titularidade, cadastro, idade ou vínculo.
- Qualquer outro tamanho/formato volta ao estado de correção, preserva a etapa anterior e não libera jornada pessoal.
- O estado guarda apenas um booleano/data de gate aprovado e o contexto de jornada necessário; não guardar o CPF inicial nem personalizar a fixture pelo CPF.
- Não descrever a pessoa como “identificada”, “autenticada” ou “titular confirmado”. Copy de produto deve explicitar que se trata de demonstração e que uma integração real exigiria autenticação e autorização servidor-side.
- Cada entrada pessoal direta, tentativa de ação de sessão anônima, retomada após expiração e navegação legada que alcance uma operação pessoal revalida o gate antes de continuar.

### 7.2 Dados pessoais na jornada

- CPF de dependente é dado de formulário necessário à fixture mutável da sessão; mantê-lo somente no estado volátil do servidor até expiração e mascarar em resumos/cartões salvo o campo de edição explicitamente controlado.
- Nunca registrar texto do usuário, CPF, nascimento, celular, conteúdo de Flow ou documento em logs de aplicação. Logs podem conter IDs de sessão/correlação, código de erro e nomes/IDs de estado não sensíveis.
- Na conversa ativa, preservar a mensagem original enviada, necessária à fidelidade da demonstração. Antes de persistir/transcrever o histórico no `sessionStorage`, mascarar CPFs reconhecidos em mensagens de usuário; a restauração não pode recuperar o valor bruto. O envio necessário ao parser transita somente pela requisição atual.
- O resumo persistido de `user.flow_submit` permanece sem payload bruto, conforme proteção já existente em `apps/web/src/chat/persistence.ts`.

## 8. Contratos, respostas e falhas

- Cliente→gateway segue os schemas atuais `user.text`, `user.quick_reply`, `user.voice`, `user.flow_submit`; servidor→cliente segue os envelopes `message.*` e `error` definidos em `packages/protocol`.
- Gateway mantém POST/SSE e gateway→chatbot mantém `POST /v1/chat/events` com NDJSON por evento. Não adicionar transporte nem provider Meta.
- Após alteração de sessão, a resposta do chatbot representa o estado confirmado; o web nunca simula sucesso por conta própria.
- Erro de formato apresenta instrução curta e permite nova tentativa. Erro de adapter/fixture preserva estado confirmado, informa indisponibilidade demonstrativa e oferece repetir/ajuda quando previsto no catálogo.
- Erro de fluxo expirado, quick reply inválido ou ID de Flow não reconhecido não deve executar mutação; retornar orientação estável, oferecer reinício/menu e manter privacidade.
- Cancelar/fechar um Flow antes do submit não grava rascunho de operação no adapter. Voltar/corrigir após revisão preserva campos não corrigidos dentro da sessão, conforme o catálogo.
- Nunca mostrar stack trace, erro HTTP cru, CPF completo em mensagem de erro ou protocolo de operação externa.

## 9. Fidelidade visual e acessibilidade

- A experiência ao cliente é o chat e os componentes dentro da aplicação web; não reproduzir sidebar, seletor de jornada, galeria, barra de inspeção, filtros ou controles de navegação do atlas de demonstração.
- Usar os elementos aprovados de `atlas-whatsapp.html` como referência para bolhas, cabeçalho do chat, cards, quick replies, cartões de documento, modal, áudio, estados de carregamento/erro, tipografia, espaçamento, cores e responsividade. Reusar tokens/componentes de `apps/web` onde sua aparência já corresponda à referência; diferenças devem ser registradas e corrigidas, não duplicadas por CSS isolado.
- Em cada `step.id`, conservar o texto, a ordem do conteúdo, a modalidade do evento, rótulos e o destino de cada ação do catálogo. Uma alteração visual não pode mudar regra de negócio.
- Definir screenshot baseline funcional em viewport mobile de 390×844 e desktop de 1440×900; capturar caminhos principais e exceções para cada grupo. Comparações devem focalizar o chat/Flow do cliente, não o chrome do explorador de telas.
- Componentes novos de documento e Flow devem ser navegáveis por teclado, ter nomes acessíveis, foco gerenciado em abertura/fechamento de modal, estados de carregamento/erro anunciados e contraste adequado. Respeitar movimento reduzido e `aria-live` já adotados.
- Layout deve permanecer utilizável em 320 px, sem overflow horizontal, e responsivo em desktop. Estados vazios, indisponíveis, erro, loading, confirmação e desistência são parte da fidelidade funcional.

## 10. Testes e critérios de aceite

### 10.1 Testes obrigatórios

1. **Domínio puro:** transições de cada grupo, gate de CPF, entradas inválidas, quick reply obsoleto, parser de frase de dependente, campos ausentes/ambíguos, correção sem perda de campos, confirmação e não inferência de sexo/gênero.
2. **Application/ports:** chamadas corretas ao `AssistancePort`, `Result` de falha, regra “só escreve após confirmação”, estado consistente depois de mutações e sessões isoladas.
3. **Idempotência:** mesmo `event.id` repetido devolve mesmo resultado e não duplica alterações/protocolos; novo evento representa nova tentativa.
4. **Contrato Zod:** eventos document new/valid/malformed; limites de quick replies e payload; validação de Flow; mensagens, forms e IDs compatíveis com protocolo.
5. **Web unitário:** renderer `message.document`, modal/foco/teclado, `FlowSheet`, áudio fixture, persistência com CPF mascarado, resumo sensível e todas as interações sem chamada de rede paralela.
6. **Integração:** web→gateway→chatbot→adapter mock em `infra/docker-compose.yml`, sem qualquer rota do fake de cotação/apólice/sinistro sendo usada como assistência.
7. **E2E Playwright:** jornada pública, gate CPF válido/inválido, dependente em frase única, revisão/correção/confirmação, leituras após mudanças, cancelamento/solicitações, erros, retomada, áudio demonstrativo, documento e regressões de todos os IDs funcionais.
8. **Segurança/privacidade:** busca automatizada de conteúdo sensível nos logs e storage; validar que nenhum CPF inicial bruto é persistido, que submits de Flow não ficam no `sessionStorage`, e que duas sessões não se contaminam.
9. **Visual:** screenshots nos viewports definidos, estados principais/alternativos dos 24 grupos; confirmar que a web exibe os mesmos textos/ações e a implementação não exibe chrome da ferramenta de protótipo.

### 10.2 Critérios de aceite

- Catálogo executável contém exatamente os 24 grupos funcionais/247 IDs previstos; nenhum `LEG-*` aparece como destino de produção.
- Automação consegue alcançar e verificar cada um dos 247 estados e cada destino declarado no catálogo, inclusive exceções. Teste falha ao encontrar ID ausente, duplicado, inalcançável ou destino desconhecido, salvo estado explicitamente marcado como referência/informativo sem ação.
- Catálogo de serviços no caminho público contém somente Telemedicina, Assistência Funeral e Assistência Farmácia, com a redação resumida e detalhes definidos pelo protótipo aprovado.
- Todo estado pessoal está inacessível antes do gate CPF; 11 dígitos quaisquer são aceitos, CPF malformado é rejeitado e nenhum teste exige CPF cadastrado ou checksum verdadeiro.
- Uma confirmação altera o mock apenas uma vez e todas as consultas subsequentes na sessão mostram o resultado; sessão diferente e sessão expirada não herdam a mudança.
- Texto extraído na jornada de dependente é explicitamente confirmado; os campos faltantes são perguntados, nunca inferidos.
- Eventos de documento passam pelo schema, renderizam cartão e modal sem URL externa ou arquivo contratual real.
- Fluxos de áudio usam apenas fixtures e não dependem de microfone, transcrição, serviço externo ou LLM real.
- Testes unitários, contratos, E2E e verificação de build/typecheck dos apps tocados passam; os CHECKLISTs dos workstreams de implementação são atualizados no mesmo commit dos respectivos itens.
- A execução local completa continua disponível pelo stack Docker Compose existente e o README descreve como iniciar e validar a demo.

## 11. Fora de escopo

- WhatsApp Cloud API, templates homologados, webhook Meta, envio/recebimento real e cobrança por conversa.
- Autenticação, autorização, consulta de cadastro, verificação de dígitos de CPF ou identidade real. O gate de formato é apenas demonstrativo e não deve ser promovido a segurança de produção.
- Integrações reais com prestadores de Telemedicina, redes de farmácia, assistência funeral, pagamentos, CRM, documentos, e-mail, SMS ou atendimento humano.
- Gravação/upload de áudio real, transcrição automática/LLM real, voz sintética ou classificação generativa externa.
- Persistência durável, recuperação após reinício, compartilhamento de state entre sessões/instâncias, banco ou arquivo de dados de cliente.
- Produtos, serviços ou benefícios fora dos três aprovados, sinistro ou informação comercial não aprovada.
- Implementar as 34 telas `LEG` como uma jornada disponível ao cliente.
- Reproduzir as ferramentas internas do protótipo (galeria, seletor, sidebar e painel de comparação) na web de produto.

## 12. Sequência sugerida para o plano de implementação

O plano posterior deve decompor o trabalho em workstreams coordenados pelo WORKBOARD, evitando dois donos no mesmo caminho. Ordem sugerida:

1. Contrato `message.document` e consumers, sob a propriedade do workstream de `packages/protocol`.
2. Estado de domínio, parser e jornadas determinísticas do chatbot, mais `AssistancePort` e adapter mock.
3. Renderers web, Flow JSON, persistência mascarada, media fixtures e modal de documento.
4. Fixtures/compose e integração ponta a ponta, depois cobertura E2E e revisão visual por ID.
5. Revisão de segurança, typecheck, suíte total e atualização dos CHECKLISTs/workboard dos caminhos alterados.

Gateway não deve ser modificado por antecipação; só entra no plano se um teste de contrato demonstrar necessidade. A SPEC descreve o alvo, não autoriza ainda o plano, a alteração de código, instalação de dependências ou implementação.

## 13. Glossário de status demonstrativos

- **Gate de CPF:** validação de formato que libera a experiência pessoal de demonstração; não comprova identidade.
- **Adapter mock:** implementação substituível de `AssistancePort`, com fixtures e estado volátil em memória.
- **Estado funcional:** nó `step.id` dos 24 grupos não-LEG do catálogo, executável ou verificável na jornada.
- **Estado de referência:** tela `LEG-*` usada para comparação histórica, sem roteamento no produto.
- **Confirmação explícita:** ação afirmativa indicada no catálogo que autoriza a mutação correspondente do estado mockado.
