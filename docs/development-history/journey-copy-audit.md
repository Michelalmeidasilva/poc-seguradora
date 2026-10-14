# Mapeamento de referências a demonstração na experiência

Aplicação do inventário: revisão entregue pela TASK-20261014-009; ver histórico de web.md e chatbot.md. As frases abaixo preservam o levantamento original.

Data: 2026-10-14. Base: implementação após cd4b05a. Pedido: mapear toda a jornada e orientar uma redação profissional e convidativa, sem disclaimers sobre a apresentação. **Este inventário não altera textos ou comportamento do produto.**

## Resultado e critério

Foram identificados **79 campos do catálogo**, com **77 textos distintos**, distribuídos em **65 etapas de 18 jornadas**. Há também mensagens de execução, interface web, catálogo de componentes e protótipo listadas abaixo. Esses números são do catálogo, não um total de todos os arquivos.

A busca cobriu mensagens, títulos, botões, notas, revisões, acessibilidade, erros e conteúdo de apoio. Inclui demonstração/demonstrativo, fictício, ilustrativo, exemplo/cenário, ações “Simular” e avisos de implementação/validação. Contagens são de campos do catálogo; cópias geradas e arquivos do atlas não são somados novamente. É uma inspeção estática, sem afirmar que todas as etapas são alcançáveis pelo mesmo percurso.

Os quatro campos DES-01.flow.discovery.services[*].note e DES-01.flow.discovery.comparison permanecem no catálogo, mas não são exibidos pelo gerador atual de três telas. Foram mantidos no inventário para evitar reintrodução pelo protótipo ou por uma alteração futura. As mensagens operacionais legítimas, como “Não há vagas disponíveis” e “Prefiro não informar”, não foram contadas como aviso de demonstração.

## Direção de redação

- Falar da necessidade e do próximo passo do usuário: consultar, escolher, revisar, continuar, acompanhar.
- Remover qualificadores como “neste exemplo”, “neste cenário”, “fictício” e “demonstrativo”.
- Remover notas editoriais, validações pendentes do produto, justificativas técnicas e avisos sobre a apresentação.
- Trocar botões “Simular…” pelo nome da ação que o usuário quer realizar.
- A redação deve descrever o estado apresentado pela jornada, sem acrescentar afirmações de pagamento, emissão ou verificação de identidade que o sistema não retornou.

Exemplos de redação proposta:

- IDE-01: “Para continuar, informe seu CPF com 11 dígitos, com ou sem pontos e hífen.”
- IDE-02: “Recebi seu CPF. Vamos continuar.”
- IDE-03: “Tudo pronto. Vamos continuar seu pedido.”
- IDE-05: “Sua sessão expirou. Informe seu CPF para continuar.”
- DEP-03: “Você pode incluir até 2 dependentes. Prefere informar os dados por aqui ou preencher o formulário?”
- PAG-03: “Continuar pagamento”.
- UTI-04: “Acessar telemedicina”.
- PRE-03: “Suas preferências foram salvas.”
- Erro geral: “Não foi possível continuar agora. Tente novamente em instantes.”
- Documento: remover o aviso de demonstração; manter título, estado de disponibilidade e ação do documento.

## Inventário por jornada

### ENT — Entrada e orientação

- **ENT-05.bot** — `apps/chatbot/src/domain/assistance-catalog.generated.json:112`
  Para consultar as pessoas vinculadas nesta demonstração, informe um CPF fictício. Depois continuamos seu pedido.
- **ENT-07.bot** — `apps/chatbot/src/domain/assistance-catalog.generated.json:168`
  Não localizei uma assistência vinculada nesta demonstração. Se você contratou recentemente, podemos consultar uma solicitação ou pedir ajuda.

### FAQ — Central de dúvidas

- **FAQ-04.bot** — `apps/chatbot/src/domain/assistance-catalog.generated.json:336`
  Os serviços são Telemedicina, Assistência Funeral para titular e dependentes, e descontos em redes credenciadas de farmácia. A assistência não é plano de saúde e não cobre procedimentos médicos, hospitalares ou ambulatoriais. Os limites e condições dependem do plano.

### IDE — Identificação e sessão

- **IDE-01.bot** — `apps/chatbot/src/domain/assistance-catalog.generated.json:547`
  Para abrir esta demonstração, digite um CPF com 11 dígitos aqui no chat, com ou sem pontuação XXX.XXX.XXX-XX. Este formato não confirma identidade.
- **IDE-02.bot** — `apps/chatbot/src/domain/assistance-catalog.generated.json:567`
  Recebi o CPF para validar o formato da demonstração.
- **IDE-03.bot** — `apps/chatbot/src/domain/assistance-catalog.generated.json:582`
  O formato do CPF foi aceito. Os dados seguintes pertencem a um cenário fictício.
- **IDE-05.bot** — `apps/chatbot/src/domain/assistance-catalog.generated.json:630`
  A sessão demonstrativa expirou. Informe novamente o CPF para continuar.
- **IDE-06.bot** — `apps/chatbot/src/domain/assistance-catalog.generated.json:650`
  Digite o CPF aqui no chat para renovar o acesso demonstrativo e retomar a revisão da ação.
- **IDE-07.bot** — `apps/chatbot/src/domain/assistance-catalog.generated.json:670`
  Não há esse dado no cenário demonstrativo. Posso oferecer ajuda.
- **IDE-08.bot** — `apps/chatbot/src/domain/assistance-catalog.generated.json:690`
  Digite um CPF com 11 dígitos aqui no chat, com ou sem pontuação XXX.XXX.XXX-XX, para abrir a demonstração.

### DES — Descoberta e comparação

- **DES-01.flow.discovery.services[0].note** — `apps/chatbot/src/domain/assistance-catalog.generated.json:884`
  Não prometer cobertura, valores, carência ou procedimentos sem confirmação das condições vigentes.
- **DES-01.flow.discovery.services[1].note** — `apps/chatbot/src/domain/assistance-catalog.generated.json:890`
  Não informar percentual, preço ou rede específica sem confirmação das condições vigentes.
- **DES-01.flow.discovery.services[2].note** — `apps/chatbot/src/domain/assistance-catalog.generated.json:896`
  Não prometer especialidades, atendimento 24 horas, preços ou disponibilidade sem validação do prestador.
- **DES-01.flow.discovery.comparison** — `apps/chatbot/src/domain/assistance-catalog.generated.json:899`
  **Individual** / R$ 29,90/mês · somente titular. /  / **Familiar** / R$ 39,90/mês · titular e até 3 dependentes neste exemplo. /  / Os benefícios, limites e carências precisam ser conferidos nas condições de cada plano.
- **DES-01.flow.discovery.plans[1].composition** — `apps/chatbot/src/domain/assistance-catalog.generated.json:912`
  Titular e até 3 dependentes elegíveis neste exemplo.
- **DES-01.flow.discovery.conditions** — `apps/chatbot/src/domain/assistance-catalog.generated.json:916`
  Confira elegibilidade, limites, carências e disponibilidade nas condições de cada plano. Não há contratação nem pagamento nesta etapa.
- **DES-01.flow.discovery.note** — `apps/chatbot/src/domain/assistance-catalog.generated.json:917`
  Preços e composição são fictícios, apresentados somente para demonstração. Assistência não é plano de saúde.
- **DES-05.bot** — `apps/chatbot/src/domain/assistance-catalog.generated.json:1087`
  Neste exemplo, há duas opções. Escolha uma para ver detalhes ou compare as diferenças.
- **DES-06.bot** — `apps/chatbot/src/domain/assistance-catalog.generated.json:1118`
  **Individual** / R$ 29,90/mês · somente titular. /  / **Familiar** / R$ 39,90/mês · titular e até 3 dependentes neste exemplo. /  / Os benefícios, limites e carências precisam ser conferidos nas condições de cada plano.
- **DES-06.actions[1].label** — `apps/chatbot/src/domain/assistance-catalog.generated.json:1126`
  Simular para mim
- **DES-07.title** — `apps/chatbot/src/domain/assistance-catalog.generated.json:1140`
  Dados para simulação
- **DES-07.flow.title** — `apps/chatbot/src/domain/assistance-catalog.generated.json:1147`
  Simular assistência
- **DES-08.bot** — `apps/chatbot/src/domain/assistance-catalog.generated.json:1175`
  **Serviços de Assistência Familiar** / Valor total: R$ 39,90/mês. / Composição deste exemplo: titular e até 3 dependentes elegíveis. / Você poderá revisar carências, limites e pagamento antes de contratar.

### ADE — Contratação

- **ADE-02.bot** — `apps/chatbot/src/domain/assistance-catalog.generated.json:1293`
  Primeiro, informe um CPF fictício. Se sua sessão demonstrativa estiver válida, esta etapa será aproveitada.
- **ADE-04.bot** — `apps/chatbot/src/domain/assistance-catalog.generated.json:1352`
  Você pode incluir dependentes agora ou depois. Neste exemplo, o plano permanece R$ 39,90/mês. Cada inclusão terá as condições e datas consultadas naquele momento.
- **ADE-06.flow.note** — `apps/chatbot/src/domain/assistance-catalog.generated.json:1466`
  Assistência não é plano de saúde. Condições ilustrativas, sujeitas à validação.
- **ADE-11.bot** — `apps/chatbot/src/domain/assistance-catalog.generated.json:1600`
  Uma condição de elegibilidade não foi atendida neste exemplo. Vou mostrar o critério informado pelo sistema antes de prosseguir.

### PAG — Pagamento da contratação

- **PAG-02.flow.choices[1].detail** — `apps/chatbot/src/domain/assistance-catalog.generated.json:1712`
  Exemplo de integração segura com a instituição
- **PAG-03.actions[0].label** — `apps/chatbot/src/domain/assistance-catalog.generated.json:1733`
  Abrir demonstração

### CON — Meu contrato e documentos

- **CON-05.bot** — `apps/chatbot/src/domain/assistance-catalog.generated.json:2046`
  Seu cancelamento está agendado para 10/11/2026 neste exemplo. Os benefícios permanecem conforme as condições informadas até a data efetiva.
- **CON-09.bot** — `apps/chatbot/src/domain/assistance-catalog.generated.json:2147`
  Não há contratos disponíveis nesta demonstração. Você pode acompanhar uma contratação em andamento ou conhecer os produtos.
- **CON-11.bot** — `apps/chatbot/src/domain/assistance-catalog.generated.json:2195`
  **Plano atual:** Familiar · R$ 39,90/mês. / **Próximo plano:** Individual · R$ 29,90/mês. / Troca agendada para 10/11/2026 neste exemplo. Até lá, permanece válido o plano atual.

### DEP — Incluir e corrigir dependentes

- **DEP-01.bot** — `apps/chatbot/src/domain/assistance-catalog.generated.json:2225`
  Posso ajudar. Informe um CPF fictício para continuar. Depois mostramos o contrato e as condições demonstrativas para inclusão.
- **DEP-03.bot** — `apps/chatbot/src/domain/assistance-catalog.generated.json:2271`
  Você tem 2 vagas disponíveis neste exemplo. Pode informar os dados pela conversa ou preencher um formulário. Mostraremos as condições antes de confirmar.
- **DEP-34.bot** — `apps/chatbot/src/domain/assistance-catalog.generated.json:2325`
  Qual é o celular do João e qual sexo biológico ele informa? Esses dados não são inferidos. Use apenas dados fictícios nesta demonstração.
- **DEP-04.bot** — `apps/chatbot/src/domain/assistance-catalog.generated.json:2368`
  Recebi o nome, a data de nascimento e o parentesco. Falta o CPF exigido neste exemplo. Você pode informar por aqui.
- **DEP-04.actions[0].label** — `apps/chatbot/src/domain/assistance-catalog.generated.json:2372`
  Simular dado
- **DEP-05.flow.note** — `apps/chatbot/src/domain/assistance-catalog.generated.json:2454`
  Use dados fictícios. Campos ilustrativos, sujeitos à validação do produto.
- **DEP-06.flow.sections[1].rows[0][1]** — `apps/chatbot/src/domain/assistance-catalog.generated.json:2508`
  Sem adicional neste exemplo
- **DEP-10.bot** — `apps/chatbot/src/domain/assistance-catalog.generated.json:2621`
  **Pessoas vinculadas** / Ana Silva · titular. / {{name}} · filha. / Vagas disponíveis neste exemplo: 2. / A disponibilidade para inclusão é consultada novamente a cada pedido.
- **DEP-14.actions[0].label** — `apps/chatbot/src/domain/assistance-catalog.generated.json:2721`
  Simular nova data
- **DEP-17.flow.sections[1].rows[0][1]** — `apps/chatbot/src/domain/assistance-catalog.generated.json:2822`
  Sem adicional neste exemplo
- **DEP-19.actions[0].label** — `apps/chatbot/src/domain/assistance-catalog.generated.json:2888`
  Simular correção
- **DEP-21.flow.sections[0].rows[4][0]** — `apps/chatbot/src/domain/assistance-catalog.generated.json:2955`
  Efeito neste exemplo
- **DEP-28.bot** — `apps/chatbot/src/domain/assistance-catalog.generated.json:3112`
  A pessoa não atende ao critério de elegibilidade retornado pelo produto neste exemplo. Podemos revisar os dados ou pedir esclarecimento.

### EXC — Excluir dependentes

- **EXC-03.flow.sections[0].rows[1][1]** — `apps/chatbot/src/domain/assistance-catalog.generated.json:3301`
  10/11/2026 neste exemplo
- **EXC-03.flow.sections[0].rows[3][1]** — `apps/chatbot/src/domain/assistance-catalog.generated.json:3309`
  Sem redução neste exemplo
- **EXC-06.bot** — `apps/chatbot/src/domain/assistance-catalog.generated.json:3378`
  A exclusão de Maria está agendada para 10/11/2026 neste exemplo. / Protocolo: EXC-2026-0091. / A vaga só será apresentada como utilizável quando as regras permitirem.
- **EXC-09.bot** — `apps/chatbot/src/domain/assistance-catalog.generated.json:3450`
  Vou verificar o agendamento. Neste exemplo, Maria permanece vinculada e não há ajuste de preço para desfazer.

### PLA — Troca de plano

- **PLA-06.flow.sections[0].rows[2][1]** — `apps/chatbot/src/domain/assistance-catalog.generated.json:3731`
  Somente titular neste cenário

### UTI — Utilizar benefícios

- **UTI-04.bot** — `apps/chatbot/src/domain/assistance-catalog.generated.json:4155`
  O acesso à telemedicina está disponível para Maria neste cenário. O atendimento acontece no ambiente do prestador.
- **UTI-04.actions[0].label** — `apps/chatbot/src/domain/assistance-catalog.generated.json:4159`
  Acessar demonstração
- **UTI-06.bot** — `apps/chatbot/src/domain/assistance-catalog.generated.json:4203`
  O sistema confirma apenas que o acesso foi disponibilizado. Não há confirmação de consulta realizada neste exemplo.
- **UTI-09.bot** — `apps/chatbot/src/domain/assistance-catalog.generated.json:4275`
  Seu acesso demonstrativo ao benefício está disponível. A identificação real e a rede serão definidas com o parceiro.
- **UTI-10.bot** — `apps/chatbot/src/domain/assistance-catalog.generated.json:4298`
  O prestador está indisponível neste cenário. Você pode tentar novamente ou solicitar suporte.

### FUN — Assistência funeral

- **FUN-08.bot** — `apps/chatbot/src/domain/assistance-catalog.generated.json:4530`
  O prestador confirmou o recebimento neste cenário. / Protocolo: FUN-2026-0082. / A próxima orientação e a previsão de contato dependem do prestador.

### COB — Cobrança e regularização

- **COB-01.bot** — `apps/chatbot/src/domain/assistance-catalog.generated.json:4604`
  **Serviços de Assistência Familiar** / Próxima cobrança: R$ 39,90 em 10/11/2026. / Neste cenário há 1 parcela pendente. Você pode consultar o detalhe antes de pagar.
- **COB-02.bot** — `apps/chatbot/src/domain/assistance-catalog.generated.json:4632`
  Parcela de setembro: R$ 39,90. / Plano Familiar: R$ 39,90. / Adicional de dependentes: R$ 0,00 neste exemplo. / Situação: em aberto. / Vencimento: 10/09/2026.
- **COB-03.flow.choices[0].detail** — `apps/chatbot/src/domain/assistance-catalog.generated.json:4665`
  Vencimento 10/09 · R$ 39,90 neste exemplo
- **COB-04.bot** — `apps/chatbot/src/domain/assistance-catalog.generated.json:4682`
  Neste cenário há um meio de regularização disponível. A disponibilidade real depende do produto e da processadora.
- **COB-05.flow.sections[0].rows[2][0]** — `apps/chatbot/src/domain/assistance-catalog.generated.json:4727`
  Encargos neste exemplo

### CAN — Cancelamento e restituição

- **CAN-03.bot** — `apps/chatbot/src/domain/assistance-catalog.generated.json:5005`
  Há uma opção de menor valor elegível neste cenário: Individual, R$ 29,90/mês. Você pode comparar os efeitos ou seguir com o cancelamento.
- **CAN-05.flow.sections[0].rows[1][0]** — `apps/chatbot/src/domain/assistance-catalog.generated.json:5064`
  Data efetiva neste cenário
- **CAN-05.flow.sections[1].rows[1][0]** — `apps/chatbot/src/domain/assistance-catalog.generated.json:5085`
  Restituição neste cenário
- **CAN-08.bot** — `apps/chatbot/src/domain/assistance-catalog.generated.json:5155`
  **Contrato encerrado** / Data efetiva neste cenário: 10/10/2026. / Protocolo: CAN-2026-0110. / O termo de cancelamento está disponível.
- **CAN-09.bot** — `apps/chatbot/src/domain/assistance-catalog.generated.json:5178`
  O cancelamento está agendado para a primeira data permitida neste cenário. Até lá, consulte as condições de utilização e cobrança apresentadas na revisão.
- **CAN-10.bot** — `apps/chatbot/src/domain/assistance-catalog.generated.json:5202`
  Há uma restituição em acompanhamento neste cenário. O valor, destino e prazo serão os retornados pelo sistema financeiro, sem estimativas do assistente.

### REN — Renovação e continuidade

- **REN-01.bot** — `apps/chatbot/src/domain/assistance-catalog.generated.json:5388`
  Seu contrato termina em 10/11/2026 neste cenário. Há uma opção de continuidade com novas condições. Você pode revisar antes de decidir.
- **REN-02.flow.sections[0].rows[1][0]** — `apps/chatbot/src/domain/assistance-catalog.generated.json:5427`
  Novo valor neste exemplo
- **REN-02.flow.sections[0].rows[2][1]** — `apps/chatbot/src/domain/assistance-catalog.generated.json:5432`
  Mantidos, sujeitos à validação

### SOL — Minhas solicitações

- **SOL-04.bot** — `apps/chatbot/src/domain/assistance-catalog.generated.json:5738`
  **Solicitação em processamento** / Protocolo: CAD-2026-0041 neste cenário. / Última atualização: 10/10/2026. / A previsão será exibida quando confirmada pela operação.
- **SOL-06.bot** — `apps/chatbot/src/domain/assistance-catalog.generated.json:5790`
  **Solicitação concluída neste cenário** / O resultado e os documentos correspondentes estão disponíveis. Consulte o detalhe do pedido para conferir seu efeito no contrato.
- **SOL-10.bot** — `apps/chatbot/src/domain/assistance-catalog.generated.json:5893`
  Vou consultar o pedido correspondente após informar um CPF fictício.

### HUM — Atendimento humano

- **HUM-03.actions[0].label** — `apps/chatbot/src/domain/assistance-catalog.generated.json:5971`
  Simular início
- **HUM-04.actions[0].label** — `apps/chatbot/src/domain/assistance-catalog.generated.json:5995`
  Simular conclusão
- **HUM-07.bot** — `apps/chatbot/src/domain/assistance-catalog.generated.json:6056`
  Seu atendimento foi concluído neste cenário. / Protocolo: HUM-2026-0042. / Os próximos passos combinados permanecem disponíveis na solicitação.

### PRE — Preferências de comunicação

- **PRE-02.bot** — `apps/chatbot/src/domain/assistance-catalog.generated.json:6596`
  Selecione os avisos opcionais que deseja receber neste exemplo.
- **PRE-02.flow.note** — `apps/chatbot/src/domain/assistance-catalog.generated.json:6618`
  Classificação dos avisos ainda sujeita à validação do negócio.
- **PRE-03.bot** — `apps/chatbot/src/domain/assistance-catalog.generated.json:6631`
  Suas escolhas opcionais foram salvas na demonstração. Comunicações necessárias seguem a política e os canais aplicáveis.

## Mensagens geradas fora do catálogo

A identificação IDE-01/02/03/05/06/07/08 é sobrescrita em `apps/chatbot/src/domain/generate-assistance-catalog.mjs:30–64`. Alterar apenas catalog.js não elimina as frases usadas hoje em apps/web. A origem dessas sete mensagens precisa ser corrigida no gerador.

- `apps/chatbot/src/application/assistance-turn.ts:333`
  Não encontrei esse dado demonstrativo. Confira a opção e tente novamente.
- `apps/chatbot/src/application/assistance-turn.ts:335`
  Não foi possível concluir esta etapa demonstrativa. Confira os dados e tente novamente.
- `apps/chatbot/src/application/assistance-turn.ts:337`
  Esta demonstração está indisponível no momento. Tente novamente mais tarde.
- `apps/chatbot/src/application/assistance-turn.ts:606` (texto interno do pedido, sem exibição direta comprovada)
  Pedido demonstrativo de retorno solicitado pela pessoa
- `apps/chatbot/src/application/assistance-turn.ts:648` (orientação de preenchimento, sem aviso de demonstração; revisar apenas se a linguagem precisar ser encurtada)
  Informe a data de nascimento correta, por exemplo: “A data correta é 20/05/2012”.
- `apps/chatbot/src/application/assistance-turn.ts:667`
  Use uma das mídias de áudio demonstrativas disponíveis.
- `apps/chatbot/src/application/assistance-turn.ts:684`
  Esta etapa demonstrativa não está disponível.
- `apps/chatbot/src/application/assistance-turn.ts:757`
  A demonstração foi concluída.
- `apps/chatbot/src/application/assistance-turn.ts:933`
  Dependentes demonstrativos cadastrados: ${dependents.value.length}.
- `apps/chatbot/src/application/handle-turn.ts:190`
  Esta demonstração está indisponível no momento.
- `apps/chatbot/src/domain/catalog.ts:198`
  Demonstração
- `apps/chatbot/src/domain/catalog.ts:199`
  Este é um formulário de demonstração, com dados fictícios, que mostra os componentes de um Flow. Toque no botão para abrir. Nenhum dado preenchido será guardado.
- `apps/chatbot/src/domain/catalog.ts:200`
  Abrir demonstração
- `apps/chatbot/src/domain/catalog.ts:208`
  Recebi o formulário de demonstração. Nenhum dado foi guardado.
- `apps/chatbot/src/domain/catalog.ts:275` (orientação de preenchimento, sem aviso de demonstração; revisar apenas se a linguagem precisar ser encurtada)
  Informe o protocolo do sinistro, por exemplo SN-2001.
- `apps/chatbot/src/domain/assistance-journey.ts:49` (residual: IDE-02/08 atualmente são chat e não exibem esse objeto flow)
  Somente o formato do CPF é verificado nesta demonstração.
- `apps/chatbot/src/domain/flows/discovery.mjs:98`
  Você continuará no chat com o serviço e o plano escolhidos para conferir os dados e concluir a contratação. Nenhuma cobrança é feita agora.

## Interface web, catálogo e acessibilidade

- `apps/web/src/app/ComponentCatalog.tsx:50`
  Chaveiro, eletricista e encanador. R$ 19,90/mês · valor ilustrativo.
- `apps/web/src/app/ComponentCatalog.tsx:60`
  Orientação e cuidado para você e sua família. R$ 24,90/mês · valor ilustrativo.
- `apps/web/src/app/ComponentCatalog.tsx:67`
  Acolhimento e apoio à família. R$ 14,90/mês · valor ilustrativo.
- `apps/web/src/app/ComponentCatalog.tsx:97`
  Protocolo de exemplo: AS-2026-001. Consulte os próximos passos do atendimento.
- `apps/web/src/app/ComponentCatalog.tsx:98`
  Dados fictícios
- `apps/web/src/app/ComponentCatalog.tsx:103`
  Documento demonstrativo
- `apps/web/src/app/ComponentCatalog.tsx:123`
  Ponto de atendimento de exemplo
- `apps/web/src/app/ComponentCatalog.tsx:124`
  São Paulo, SP · localização ilustrativa
- `apps/web/src/app/ComponentCatalog.tsx:193`
  Exemplo selecionado: ${title}
- `apps/web/src/app/ComponentCatalog.tsx:201`
  Mensagem enviada de exemplo
- `apps/web/src/app/ComponentCatalog.tsx:225`
  Exemplo de falha. Tente novamente.
- `apps/web/src/app/ComponentCatalog.tsx:243`
  Resultado do exemplo
- `apps/web/src/app/ComponentCatalog.tsx:244`
  Dados fictícios. Nenhuma solicitação será enviada nesta área.
- `apps/web/src/flows/showcase-flow.ts:17`
  Formulário de exemplo
- `apps/web/src/flows/showcase-flow.ts:22`
  Use somente dados fictícios nesta demonstração.
- `apps/web/src/flows/showcase-flow.ts:99`
  Li as condições do exemplo
- `apps/web/src/flows/showcase-flow.ts:104`
  Condições aceitas. Você pode concluir o exemplo.
- `apps/web/src/flows/showcase-flow.ts:128`
  Concluir exemplo
- `apps/web/src/flows/showcase-flow.ts:136`
  Condições do exemplo
- `apps/web/src/flows/showcase-flow.ts:166`
  Confirmar leitura do exemplo
- `apps/web/src/flows/showcase-flow.ts:177`
  Concluir exemplo
- `apps/web/src/chat/Composer.tsx:65`
  Cenários de áudio demonstrativo
- `apps/web/src/chat/Composer.tsx:82`
  Áudio demonstrativo
- `apps/web/src/app/ComponentCatalog.tsx:147`
  Os componentes do atendimento, com exemplos de seguros e assistências. As ações desta área são demonstrativas.
- `apps/web/src/app/ComponentCatalog.tsx:219`
  Áudio ilustrativo gerado localmente.
- `apps/web/src/renderers/DocumentMessage.tsx:99`
  Este é um conteúdo demonstrativo. Nenhum documento real está disponível.
- `apps/web/src/flows/showcase-flow.ts:20`
  Experimente os campos da solicitação. Nenhum dado será enviado ao atendimento.
- `apps/web/src/flows/FlowSheet.tsx:317`
  Rodapé repetido em todo Flow: “Digio · experiência estruturada no WhatsApp”. Não contém a palavra demonstração, mas expõe uma descrição da solução em todas as etapas.

## Flows JSON e cópias geradas

Os mesmos textos reaparecem em `apps/chatbot/src/domain/flows/*.flow.json` e nas cópias de `apps/web/src/flows/fixtures/*.flow.json`. Os textos derivados de campos do catálogo acima são duplicações, não novos casos de redação.

Os seguintes textos adicionais são escritos diretamente no Flow auxiliar de componentes:

- `apps/chatbot/src/domain/flows/demo-componentes.flow.json:12` — Demonstração
- `apps/chatbot/src/domain/flows/demo-componentes.flow.json:17` — Um Flow de demonstração
- `apps/chatbot/src/domain/flows/demo-componentes.flow.json:19` — Dados fictícios, apenas para teste.

A observação “O legado solicita estes dados. Obrigatoriedade e opções precisam ser validadas pelo produto.” em DEP-34.flow.note também deve sair da interface: é instrução editorial. DEP-06.flow.note repete “Confira a disponibilidade de cada benefício nas condições do produto.”; entra na revisão de remoção de disclaimers solicitada, embora não declare que é demonstração.

## Dados e respostas do adapter: não confundir API com texto exibido

Em `apps/chatbot/src/infra/mock-assistance.ts` há conteúdo que pode reaparecer em consultas/documentos ou em futuras renderizações. Hoje `listDocuments` usa `documentsByScreen` com títulos neutros; os títulos demonstrativos do snapshot não são os títulos desse retorno. Não contei os campos internos como ocorrências comprovadas na conversa.

- `apps/chatbot/src/infra/mock-assistance.ts:142` — Termo demonstrativo de adesão
- `apps/chatbot/src/infra/mock-assistance.ts:143` — Condições demonstrativas do serviço
- `apps/chatbot/src/infra/mock-assistance.ts:144` — Comprovante demonstrativo
- `apps/chatbot/src/infra/mock-assistance.ts:149` — Informação demonstrativa; nenhuma cobrança foi realizada.
- `apps/chatbot/src/infra/mock-assistance.ts:158` — Rua Demonstrativa, 100
- `apps/chatbot/src/infra/mock-assistance.ts:318` — Renovação demonstrativa registrada.
- `apps/chatbot/src/infra/mock-assistance.ts:334` — Solicitação demonstrativa de atualização cadastral recebida para verificação.
- `apps/chatbot/src/infra/mock-assistance.ts:354` — Solicitação demonstrativa de assistência funeral recebida.
- `apps/chatbot/src/infra/mock-assistance.ts:372` — Cancelamento demonstrativo confirmado.
- `apps/chatbot/src/infra/mock-assistance.ts:390` — Regularização demonstrativa registrada; nenhum pagamento foi realizado.
- `apps/chatbot/src/infra/mock-assistance.ts:392` — Regularização demonstrativa registrada.

Campos técnicos como `demonstrative: true`, `status: demonstrative`, `availability: illustrative`, IDs com DEMO, comentários de código, nomes de arquivos e URLs de exemplo não são microcopy por si só. Não precisam ser renomeados para cumprir a revisão de experiência.

## Protótipo e atlas: superfícies adicionais

Além da aplicação React, o protótipo possui seus próprios avisos. `atlas-whatsapp.html` incorpora cópias de catalog.js/app.js/index.html; a edição do arquivo exportado isoladamente perde a alteração na próxima exportação.

- `docs/prototypes/whatsapp-experience/index.html:60`
  Protótipo UX · dados fictícios
- `docs/prototypes/whatsapp-experience/index.html:96`
  Acessibilidade da conversa: “Conversa simulada”.
- `docs/prototypes/whatsapp-experience/index.html:98`
  Acessibilidade do anexo: “Simular envio de documento”.
- `docs/prototypes/whatsapp-experience/index.html:101`
  Acessibilidade do campo: “Mensagem de demonstração”.
- `docs/prototypes/whatsapp-experience/index.html:115`
  Clique nos botões para percorrer a jornada. Texto livre usa respostas demonstrativas.
- `docs/prototypes/whatsapp-experience/index.html:161`
  Documento de demonstração
- `docs/prototypes/whatsapp-experience/index.html:166`
  Exemplo visual. Não é um documento contratual ou comprovante válido.
- `docs/prototypes/whatsapp-experience/app.js:19`
  Rua Exemplo, 100
- `docs/prototypes/whatsapp-experience/app.js:144`
  Acessibilidade do áudio: “Reproduzir transcrição demonstrativa”.
- `docs/prototypes/whatsapp-experience/app.js:150`
  Documento demonstrativo · PDF
- `docs/prototypes/whatsapp-experience/app.js:165`
  Conversa de demonstração · use apenas dados fictícios
- `docs/prototypes/whatsapp-experience/app.js:269`
  Use um arquivo de até 10 MB nesta demonstração.
- `docs/prototypes/whatsapp-experience/app.js:449`
  Contrato demonstrativo: final 2048. / Data demonstrativa: 10/10/2026. / No produto real, o arquivo será gerado pelo sistema responsável e vinculado à versão correta das condições, ao contrato ou à solicitação.
- `docs/prototypes/whatsapp-experience/app.js:473`
  Transcrição demonstrativa: quero incluir minha filha na assistência.
- `docs/prototypes/whatsapp-experience/app.js:580`
  Recebi a correção. Nesta demonstração, você pode escrever “a data correta é 12/03/2014” ou “o nome é Maria Silva”. Outros dados precisam ser verificados pelo produto.
- `docs/prototypes/whatsapp-experience/app.js:625`
  Dados recebidos na demonstração. Você pode abrir a revisão para conferir, ou continuar preenchendo pelo formulário.
- `docs/prototypes/whatsapp-experience/app.js:633`
  Esta é uma conversa demonstrativa. Use os botões desta tela ou escreva uma necessidade, como “incluir dependente”, “ver documentos” ou “resolver pagamento”.

Os textos de identificação originais do protótipo também diferem das sobrescritas usadas no chatbot: catalog.js:360/367/374/391/398/415 contêm CPF fictício, acesso demonstrativo e validação somente de formato. O título em catalog.js:372 é “Acesso demonstrativo liberado”. São uma segunda origem a revisar, além do gerador da aplicação.

No inspetor do protótipo, `renderInspector` também exibe `step.rule`, `group.decision`, `step.intent` e `step.behavior`; por isso textos técnicos, “Proposta a validar” e regras de produto podem ficar à vista do executivo mesmo quando não entram no chat. O rótulo “Condição a validar” e a nota “Representação de UX. Interface nativa, autenticação, pagamentos e integrações dependem do provedor e da validação do produto.” ficam em index.html:129–140.

Regras distintas com linguagem de demonstração ou orientação interna (não exibidas como mensagens na web, mas visíveis no inspetor):

- IDE-01, IDE-02, IDE-03, IDE-04, IDE-05, IDE-06, IDE-07, IDE-08: Demonstração local: somente validação de formato, sem cálculo de dígitos verificadores. Sessão de 15 minutos em memória.
- DES-01, DES-02, DES-03, DES-04, DES-05, DES-06, DES-07, DES-08, DES-09, DES-10, DES-11: Produtos, preços e benefícios mostrados são fictícios. Assistência não é plano de saúde.
- DES-12: Não prometer cobertura, valores, carência ou procedimentos sem confirmação das condições vigentes.
- DES-13: Não informar percentual, preço ou rede específica sem confirmação das condições vigentes.
- DES-14: Não prometer especialidades, atendimento 24 horas, preços ou disponibilidade sem validação do prestador.
- ADE-01, ADE-02, ADE-03, ADE-04, ADE-05, ADE-06, ADE-07, ADE-08, ADE-09, ADE-10, ADE-11, ADE-12, ADE-13: Elegibilidade, documentos, cobrança e emissão dependem do produto. Preço fictício de R$ 39,90.
- PAG-01, PAG-02, PAG-03, PAG-04, PAG-05, PAG-06, PAG-07, PAG-08, PAG-09, PAG-10: Meios ilustrativos: não pressupõem suporte real. Dados completos de cartão não são solicitados no chat.
- DEP-01, DEP-02, DEP-03, DEP-34, DEP-04, DEP-05, DEP-06, DEP-07, DEP-08, DEP-09, DEP-10, DEP-11, DEP-12, DEP-13, DEP-14, DEP-15, DEP-16, DEP-17, DEP-18, DEP-19, DEP-20, DEP-21, DEP-22, DEP-23, DEP-24, DEP-25, DEP-26, DEP-27, DEP-28, DEP-29, DEP-30, DEP-31, DEP-32: Campos obrigatórios, vagas, carências e custos precisam ser validados. O exemplo tem titular + até 3 dependentes.
- DEP-33: Exemplo baseado no slide. Celular e sexo biológico constam do legado; confirmar com produto se continuam obrigatórios. Nunca inferir sexo ou gênero pelo nome ou parentesco.
- COB-01, COB-02, COB-03, COB-04, COB-05, COB-06, COB-07, COB-08, COB-09, COB-10, COB-11, COB-12, COB-13, COB-14: Não generalizar regra de 90 dias nem cobrança retroativa das notas da reunião. Meios e valores são demonstrativos.

## Onde corrigir para a alteração persistir

1. Catálogo principal: `docs/prototypes/whatsapp-experience/catalog.js`.
2. Sobrescritas de identificação: `apps/chatbot/src/domain/generate-assistance-catalog.mjs`.
3. Mensagens de execução e fallback: `assistance-turn.ts`, `handle-turn.ts` e catálogo legado em `domain/catalog.ts`.
4. Rodapés e textos locais da web: `FlowSheet.tsx`, `Composer.tsx`, `DocumentMessage.tsx`, `ComponentCatalog.tsx`, `showcase-flow.ts`.
5. Texto exclusivo da nova descoberta: `apps/chatbot/src/domain/flows/discovery.mjs`.
6. Se o protótipo/atlas continuar sendo apresentado, revisar `index.html` e `app.js`, além da fonte do catálogo.
7. Regenerar `assistance-catalog.generated.json`, os Flows canônicos e fixtures web; reexportar o atlas. Testes que procuram a redação antiga precisam acompanhar a mudança.

## Verificação deste mapeamento

Varredura estática em apps/web, apps/chatbot, packages, infra e protótipo; leitura dos renderizadores e geradores para distinguir exibição, artefatos derivados e metadados. Sem alteração do produto, sem deploy e sem execução de suíte de produto. Evidência proporcional: workboard-check e git diff --check. Task TASK-20261014-008.
