/* global window */
/* Catálogo de UX. Todos os nomes, preços, documentos e datas são demonstrativos. */
(() => {
  const screen = (id, title, user, bot, options = {}) => ({
    id,
    title,
    user,
    bot,
    mode: 'chat',
    actions: [],
    alternative: false,
    ...options,
  });
  const variant = (options = {}) => ({ alternative: true, ...options });
  const action = (label, target) => ({ label, target });
  const form = (title, fields, submit, target, extra = {}) => ({
    mode: 'form',
    flow: { title, fields, submit, target, ...extra },
  });
  const list = (title, choices, submit, extra = {}) => ({
    mode: 'list',
    flow: { title, choices, submit, ...extra },
  });
  const review = (title, sections, submit, target, extra = {}) => ({
    mode: 'review',
    flow: { title, sections, submit, target, ...extra },
  });
  const person = [
    ['Nome', '{{name}}'],
    ['Nascimento', '{{birth}}'],
    ['CPF', '{{maskedDocument}}'],
    ['Parentesco', '{{relationship}}'],
    ['Celular', '{{phone}}'],
    ['Sexo biológico', '{{biologicalSex}}'],
  ];
  const dependentFields = [
    { name: 'name', label: 'Nome completo', value: 'Maria Silva', required: true },
    {
      name: 'birth',
      label: 'Data de nascimento',
      type: 'date',
      value: '2014-03-12',
      required: true,
    },
    { name: 'document', label: 'CPF', value: '', placeholder: 'Informe o CPF', required: true },
    {
      name: 'relationship',
      label: 'Parentesco',
      type: 'select',
      choices: ['Selecione', 'Filha', 'Filho', 'Cônjuge', 'Outro'],
      required: true,
    },
    { name: 'phone', label: 'Celular do dependente', type: 'tel', placeholder: '(00) 00000-0000', required: true },
    {
      name: 'biologicalSex',
      label: 'Sexo biológico (informado pela pessoa)',
      type: 'select',
      choices: ['Selecione', 'Feminino', 'Masculino', 'Prefiro não informar'],
      required: true,
    },
  ];
  const contracts = [
    {
      label: 'Assistência Saúde',
      detail: 'Familiar · ativa · contrato final 2048',
      target: 'CON-02',
    },
    {
      label: 'Assistência Saúde',
      detail: 'Individual · ativa · contrato final 1092',
      target: 'CON-02',
    },
    { label: 'Assistência Saúde', detail: 'Encerrado · contrato final 0871', target: 'CON-06' },
  ];
  const dependentReview = () => [
    { title: 'Pessoa que será incluída', rows: person },
    {
      title: 'Efeitos da inclusão',
      rows: [
        ['Valor adicional', 'Sem adicional neste exemplo'],
        ['Mensalidade total', 'R$ 39,90'],
        ['Inclusão efetiva', '10/10/2026'],
        ['Telemedicina', 'Conforme condições do benefício'],
        ['Vagas após inclusão', '1 vaga'],
      ],
    },
  ];
  const groups = [];
  const journey = (code, title, stage, description, decision, rule, steps) =>
    groups.push({ code, title, stage, description, decision, rule, steps });

  journey(
    'ENT',
    'Entrada e orientação',
    'Começar',
    'Uma conversa que parte da necessidade, com sugestões quando o cliente precisa de orientação.',
    'Conversa livre com menu por necessidades. Identificação apenas quando necessária.',
    'Público de clientes e interessados ainda é hipótese. Catálogo e permissões dependem do produto.',
    [
      screen(
        'ENT-01',
        'Pedido direto',
        'Quero incluir minha filha na assistência.',
        'Posso ajudar com a inclusão. Vou localizar sua assistência e verificar as condições.',
        { actions: [action('Continuar', 'IDE-01')] },
      ),
      screen(
        'ENT-02',
        'Boas-vindas',
        'Oi',
        'Olá! Sou o assistente virtual da Digio para assistências. Como posso ajudar você hoje?',
        {
          actions: [
            action('Conhecer produtos', 'DES-01'),
            action('Meu contrato', 'IDE-01'),
            action('Falar com uma pessoa', 'HUM-01'),
          ],
        },
      ),
      screen(
        'ENT-03',
        'Pedido ambíguo',
        'Quero cancelar.',
        'Você quer cancelar um contrato existente ou desistir de uma solicitação que ainda não concluiu?',
        {
          ...variant(),
          actions: [action('Cancelar contrato', 'CAN-01'), action('Desistir do pedido', 'RET-08')],
        },
      ),
      screen(
        'ENT-04',
        'Informação sem identificação',
        'O que é a assistência saúde?',
        'É um pacote de serviços e benefícios, conforme o plano. Não é um plano de saúde e não oferece cobertura para procedimentos médicos, hospitalares ou ambulatoriais.',
        { actions: [action('Ver benefícios', 'DES-04'), action('Ver opções', 'DES-05'), action('Tirar dúvidas', 'FAQ-01')] },
      ),
      screen(
        'ENT-05',
        'Pedido com dados pessoais',
        'Quem está no meu plano?',
        'Para consultar as pessoas vinculadas, preciso verificar sua identidade. Depois continuamos seu pedido.',
        { actions: [action('Verificar identidade', 'IDE-02')] },
      ),
      screen(
        'ENT-06',
        'Mais de um contrato',
        'Quero consultar minha assistência.',
        'Você tem mais de um contrato. Qual deseja consultar?',
        list('Escolher contrato', contracts, 'Consultar contrato'),
      ),
      screen(
        'ENT-07',
        'Nenhum contrato localizado',
        'Quero ver minha assistência.',
        'Não localizei uma assistência vinculada à identidade verificada. Se você contratou recentemente, podemos consultar uma solicitação ou pedir ajuda.',
        {
          ...variant(),
          actions: [
            action('Ver solicitações', 'SOL-01'),
            action('Pedir ajuda', 'HUM-01'),
            action('Conhecer produtos', 'DES-01'),
          ],
        },
      ),
      screen(
        'ENT-08',
        'Retorno com solicitação',
        'Oi, voltei.',
        'Há uma solicitação que você começou e ainda não concluiu. Quer continuar ou falar sobre outro assunto?',
        { actions: [action('Continuar', 'RET-01'), action('Outro assunto', 'NAV-01')] },
      ),
      screen(
        'ENT-09',
        'Pedido de uma pessoa',
        'Quero falar com alguém.',
        'Vou verificar a disponibilidade da equipe e levar o contexto da sua conversa.',
        { actions: [action('Continuar atendimento', 'HUM-02')] },
      ),
    ],
  );

  journey(
    'FAQ',
    'Central de dúvidas',
    'Começar',
    'Respostas informativas sobre os três serviços aprovados, com limites e condições remetidos ao produto vigente.',
    'Informar sem identificar; não prometer cobertura, disponibilidade ou carência não confirmada.',
    'Conteúdo público. Valores, elegibilidade, rede, limites e carências devem vir das condições vigentes do plano.',
    [
      screen(
        'FAQ-01',
        'Tópicos de dúvidas',
        'Quero tirar uma dúvida.',
        'Sobre qual assunto você quer saber?',
        { ...list('Central de dúvidas', [
          { label: 'Informações gerais', detail: 'O que é a Assistência Saúde', target: 'FAQ-02' },
          { label: 'Como utilizar', detail: 'Telemedicina, funeral e farmácia', target: 'FAQ-03' },
          { label: 'Coberturas', detail: 'O que está incluído e o que não está', target: 'FAQ-04' },
          { label: 'Carências', detail: 'Consultar condições do plano', target: 'FAQ-05' },
        ], 'Ver resposta'), actions: [action('Menu', 'NAV-01')] },
      ),
      screen('FAQ-02', 'Informações gerais', 'O que é a assistência?', 'A Assistência Saúde reúne exclusivamente Telemedicina, Assistência Funeral com suporte ao titular e dependentes, e Assistência Farmácia com descontos em redes credenciadas. Não é um plano de saúde.', { actions: [action('Voltar aos tópicos', 'FAQ-01')] }),
      screen('FAQ-03', 'Como utilizar', 'Como uso os serviços?', 'A Telemedicina é acessada no ambiente do prestador; a Assistência Funeral oferece suporte ao titular e dependentes; a Assistência Farmácia dá acesso a descontos em redes credenciadas. Disponibilidade e instruções específicas devem ser consultadas para o seu plano.', { actions: [action('Voltar aos tópicos', 'FAQ-01'), action('Consultar meus benefícios', 'UTI-01')] }),
      screen('FAQ-04', 'Coberturas', 'Quais são as coberturas?', 'Os serviços são Telemedicina, Assistência Funeral para titular e dependentes, e descontos em redes credenciadas de farmácia. A assistência não é plano de saúde e não cobre procedimentos médicos, hospitalares ou ambulatoriais. Os limites e condições dependem do plano.', { actions: [action('Voltar aos tópicos', 'FAQ-01')] }),
      screen('FAQ-05', 'Carências', 'Quais são as carências?', 'A carência aplicável depende do serviço e das condições vigentes do seu plano. Não vou estimar um prazo: consulte seu contrato ou autentique para verificarmos a condição aplicável.', { actions: [action('Ver contrato', 'CON-01'), action('Voltar aos tópicos', 'FAQ-01')] }),
    ],
  );

  journey(
    'NAV',
    'Menu por necessidades',
    'Começar',
    'Navegação de apoio, sem obrigar o cliente a conhecer a estrutura interna da plataforma.',
    'Menu por necessidades. Voltar preserva dados; desistência é explícita.',
    'As opções precisam refletir o catálogo e as ações realmente disponíveis.',
    [
      screen(
        'NAV-01',
        'Menu de apoio',
        'O que posso fazer por aqui?',
        'Você pode escrever o que precisa ou escolher uma destas opções.',
        list(
          'Como podemos ajudar?',
          [
            {
              label: 'Conhecer produtos',
              detail: 'Benefícios, planos e contratação',
              target: 'DES-01',
            },
            {
              label: 'Usar assistências',
              detail: 'Telemedicina, funeral e farmácia',
              target: 'UTI-01',
            },
            {
              label: 'Consultar meu contrato',
              detail: 'Situação, participantes e documentos',
              target: 'CON-01',
            },
            {
              label: 'Fazer alterações',
              detail: 'Dependentes, cadastro e plano',
              target: 'NAV-02',
            },
            { label: 'Resolver pagamentos', detail: 'Cobranças e regularização', target: 'COB-01' },
            {
              label: 'Acompanhar solicitações',
              detail: 'Consultar pedidos por contrato',
              target: 'SOL-01',
            },
            { label: 'Encerrar contrato', detail: 'Condições e cancelamento', target: 'CAN-01' },
            { label: 'Encerrar conversa', detail: 'Finalizar este atendimento sem alterar contrato ou pedidos', target: 'FIM-01' },
            { label: 'Tirar dúvidas', detail: 'Informações, utilização, coberturas e carências', target: 'FAQ-01' },
            {
              label: 'Falar com uma pessoa',
              detail: 'Atendimento ou pedido de retorno',
              target: 'HUM-01',
            },
          ],
          'Continuar',
        ),
      ),
      screen(
        'NAV-02',
        'Escolher alteração',
        'Quero fazer uma alteração.',
        'Qual alteração você precisa fazer?',
        list(
          'Alterar contrato',
          [
            {
              label: 'Gerenciar dependentes',
              detail: 'Consultar, incluir ou excluir',
              target: 'DEP-01',
            },
            {
              label: 'Trocar plano',
              detail: 'Comparar alternativas disponíveis',
              target: 'PLA-01',
            },
            {
              label: 'Atualizar cadastro',
              detail: 'Solicitar atualização de dados',
              target: 'CAD-01',
            },
          ],
          'Continuar',
        ),
      ),
      screen(
        'NAV-03',
        'Voltar sem perder dados',
        'Quero voltar.',
        'Seus dados de preenchimento estão preservados. Podemos revisar a etapa anterior.',
        { actions: [action('Revisar dados', 'DEP-06'), action('Menu', 'NAV-01')] },
      ),
      screen(
        'NAV-04',
        'Desistir da solicitação',
        'Não quero continuar esta inclusão.',
        'Você quer abandonar esta solicitação de inclusão? Seu contrato atual não será alterado.',
        {
          ...variant(),
          actions: [
            action('Abandonar solicitação', 'RET-08'),
            action('Continuar inclusão', 'DEP-04'),
          ],
        },
      ),
    ],
  );

  journey(
    'IDE',
    'Identificação e sessão',
    'Começar',
    'Autenticação obrigatória antes de qualquer jornada pessoal, com retorno ao pedido original.',
    'CPF localiza o cadastro; código confirma o acesso. Sessão válida pode ser reutilizada.',
    'Demonstração local: CPF fictício 529.982.247-25 e código 123456. Canal real, segurança e duração de sessão serão definidos com o banco.',
    [
      screen(
        'IDE-01',
        'Identificação necessária',
        'Quero consultar meu contrato.',
        'Antes de acessar dados pessoais ou do contrato, precisamos autenticar seu acesso. O CPF localiza o cadastro e o código confirma sua identidade. Depois retomamos seu pedido.',
        { actions: [action('Informar CPF', 'IDE-08'), action('Já tenho código', 'IDE-02')] },
      ),
      screen(
        'IDE-02',
        'Verificação de demonstração',
        'Vou verificar.',
        'Informe o código de acesso enviado pelo canal cadastrado. Na demonstração, use 123456. O envio real não acontece neste protótipo.',
        form(
          'Verificar identidade',
          [
            {
              name: 'verification',
              label: 'Código demonstrativo',
              placeholder: 'Digite 123456',
              required: true,
              pattern: '123456',
            },
          ],
          'Verificar',
          'IDE-03',
          { note: 'Código de demonstração: 123456. Não informe dados reais.' },
        ),
      ),
      screen(
        'IDE-03',
        'Identidade verificada',
        '123456',
        '**Titular identificado**\nAna Silva\nCPF: •••.•••.•••-25\n\nIdentidade verificada. Vamos continuar sua solicitação.',
        { actions: [action('Continuar solicitação', 'CON-02'), action('Ver contrato', 'CON-02')] },
      ),
      screen(
        'IDE-04',
        'Verificação não concluída',
        'O código não funcionou.',
        'Não foi possível concluir a verificação. Confira o código ou peça uma nova tentativa.',
        {
          ...variant(),
          actions: [action('Tentar novamente', 'IDE-02'), action('Pedir ajuda', 'HUM-01')],
        },
      ),
      screen(
        'IDE-05',
        'Sessão expirada',
        'Quero continuar.',
        'Sua sessão de identificação expirou. Os dados da solicitação estão salvos. Vamos verificar sua identidade novamente.',
        { ...variant(), actions: [action('Verificar novamente', 'IDE-02')] },
      ),
      screen(
        'IDE-06',
        'Confirmação adicional',
        'Quero confirmar o cancelamento.',
        'Esta ação exige uma confirmação adicional de identidade. Depois, você poderá revisar o cancelamento.',
        {
          actions: [action('Confirmar identidade', 'IDE-02')],
          behavior:
            'Após verificação, retornar à revisão da ação sensível, sem executá-la automaticamente.',
        },
      ),
      screen(
        'IDE-07',
        'Vínculo não reconhecido',
        'Esse contrato não é meu.',
        'Não vou exibir outros dados desse contrato. Podemos encaminhar a divergência para a equipe responsável.',
        { ...variant(), actions: [action('Solicitar atendimento', 'HUM-08')] },
      ),
      screen(
        'IDE-08',
        'CPF para localizar cadastro',
        'Vou informar meu CPF.',
        'Informe somente o CPF fictício 529.982.247-25 nesta demonstração. O CPF sozinho não libera o acesso: a próxima etapa exige o código.',
        form('Localizar cadastro', [
          { name: 'authCpf', label: 'CPF demonstrativo', placeholder: '529.982.247-25', required: true },
        ], 'Continuar para código', 'IDE-02'),
      ),
    ],
  );

  journey(
    'AUD',
    'Entrada por áudio',
    'Começar',
    'Pedidos por voz com revisão escrita de dados críticos e perguntas sobre trechos incertos.',
    'Áudio é entrada de intenção, não confirmação automática de operações.',
    'Processamento de áudio, privacidade e limites dependem do provedor.',
    [
      screen(
        'AUD-01',
        'Áudio recebido',
        'Áudio · 0:18',
        'Recebi seu áudio. Estou verificando o pedido para continuar.',
        { mode: 'audio', actions: [action('Ver compreensão', 'AUD-02')] },
      ),
      screen(
        'AUD-02',
        'Pedido compreendido',
        'Quero incluir minha filha Maria.',
        'Entendi que você quer incluir Maria na assistência. Vou verificar seu contrato e as condições.',
        { actions: [action('Continuar', 'DEP-02')] },
      ),
      screen(
        'AUD-03',
        'Compreensão parcial',
        'Áudio · 0:21',
        'Entendi o pedido de inclusão, mas não consegui confirmar a data de nascimento. Pode escrevê-la ou enviar outro áudio?',
        { ...variant({ mode: 'audio' }), actions: [action('Informar por texto', 'DEP-04')] },
      ),
      screen(
        'AUD-04',
        'Áudio não compreendido',
        'Áudio · 0:08',
        'Não consegui compreender este áudio. Você pode reenviar, escrever seu pedido ou falar com uma pessoa.',
        {
          ...variant({ mode: 'audio' }),
          actions: [action('Escrever pedido', 'ENT-02'), action('Pedir ajuda', 'HUM-01')],
        },
      ),
      screen(
        'AUD-05',
        'Revisão escrita',
        'Áudio · 0:30',
        'Estes são os dados que compreendi. Confira o nome e a data antes de continuar.',
        {
          mode: 'audio',
          actions: [action('Revisar dados', 'DEP-06'), action('Corrigir', 'DEP-14')],
        },
      ),
      screen(
        'AUD-06',
        'Vários pedidos no áudio',
        'Quero incluir minha filha e entender a mensalidade.',
        'Entendi dois pedidos: explicar a mensalidade e incluir sua filha. Por qual começamos?',
        {
          actions: [action('Explicar cobrança', 'COB-02'), action('Incluir dependente', 'DEP-01')],
        },
      ),
    ],
  );

  journey(
    'DES',
    'Descoberta e comparação',
    'Escolher',
    'Entender benefícios e comparar alternativas elegíveis, com a escolha nas mãos do cliente.',
    'Comparação neutra: mesmo destaque, nenhuma opção pré-selecionada.',
    'Produtos, preços e benefícios mostrados são fictícios. Assistência não é plano de saúde.',
    [
      screen(
        'DES-01',
        'Produtos disponíveis',
        'O que vocês oferecem?',
        'Posso apresentar os produtos disponíveis. Qual assunto você quer conhecer?',
        list(
          'Conhecer produtos',
          [
            {
              label: 'Assistência Funeral',
              detail: 'Suporte ao titular e aos dependentes, conforme as condições do serviço.',
              target: 'DES-12',
            },
            {
              label: 'Assistência Farmácia',
              detail: 'Descontos em redes credenciadas, conforme as condições do serviço.',
              target: 'DES-13',
            },
            {
              label: 'Telemedicina',
              detail: 'Atendimento remoto no ambiente do prestador, conforme disponibilidade.',
              target: 'DES-14',
            },
          ],
          'Ver detalhes',
        ),
      ),
      screen(
        'DES-12',
        'Detalhes · Assistência Funeral',
        'Quero saber mais sobre a Assistência Funeral.',
        'A Assistência Funeral oferece suporte ao titular e aos dependentes. A utilização depende das condições, limites e elegibilidade previstos no serviço contratado.',
        {
          ...review(
            'Assistência Funeral',
            [
              { title: 'O que é', rows: [['Serviço', 'Suporte de assistência funeral ao titular e aos dependentes.']] },
              { title: 'Antes de utilizar', rows: [['Condições', 'Consulte as regras, limites e elegibilidade do serviço contratado.']] },
            ],
            'Conhecer opções da Assistência Saúde',
            'DES-05',
            { correction: 'DES-01', secondaryLabel: 'Voltar aos serviços' },
          ),
          actions: [action('Voltar aos serviços', 'DES-01')],
          rule: 'Não prometer cobertura, valores, carência ou procedimentos sem confirmação das condições vigentes.',
        },
      ),
      screen(
        'DES-13',
        'Detalhes · Assistência Farmácia',
        'Quero saber mais sobre a Assistência Farmácia.',
        'A Assistência Farmácia oferece descontos em redes credenciadas. As redes participantes e as condições de uso devem ser confirmadas antes da utilização.',
        {
          ...review(
            'Assistência Farmácia',
            [
              { title: 'O que é', rows: [['Benefício', 'Descontos em redes credenciadas.']] },
              { title: 'Antes de utilizar', rows: [['Condições', 'Consulte redes participantes e regras vigentes do serviço contratado.']] },
            ],
            'Conhecer opções da Assistência Saúde',
            'DES-05',
            { correction: 'DES-01', secondaryLabel: 'Voltar aos serviços' },
          ),
          actions: [action('Voltar aos serviços', 'DES-01')],
          rule: 'Não informar percentual, preço ou rede específica sem confirmação das condições vigentes.',
        },
      ),
      screen(
        'DES-14',
        'Detalhes · Telemedicina',
        'Quero saber mais sobre a Telemedicina.',
        'A Telemedicina acontece no ambiente do prestador, conforme disponibilidade, limites e condições do serviço contratado.',
        {
          ...review(
            'Telemedicina',
            [
              { title: 'O que é', rows: [['Atendimento', 'Atendimento remoto realizado no ambiente do prestador.']] },
              { title: 'Antes de utilizar', rows: [['Condições', 'Disponibilidade, limites e demais condições dependem do serviço contratado.']] },
            ],
            'Conhecer opções da Assistência Saúde',
            'DES-05',
            { correction: 'DES-01', secondaryLabel: 'Voltar aos serviços' },
          ),
          actions: [action('Voltar aos serviços', 'DES-01')],
          rule: 'Não prometer especialidades, atendimento 24 horas, preços ou disponibilidade sem validação do prestador.',
        },
      ),
      screen(
        'DES-02',
        'Entender a necessidade',
        'Quero algo para minha família.',
        'Você quer conhecer Telemedicina, Assistência Funeral para titular e dependentes ou Assistência Farmácia com descontos em redes credenciadas?',
        {
          actions: [
            action('Serviços de assistência', 'DES-03'),
            action('Ver planos', 'DES-05'),
          ],
        },
      ),
      screen(
        'DES-03',
        'Apresentação do produto',
        'Quero conhecer a assistência saúde.',
        'A Assistência Saúde oferece somente três serviços: Telemedicina; Assistência Funeral, com suporte ao titular e aos dependentes; e Assistência Farmácia, com descontos em redes credenciadas. Não é um plano de saúde e não oferece cobertura para procedimentos médicos, hospitalares ou ambulatoriais.',
        { actions: [action('Ver benefícios', 'DES-04'), action('Ver planos', 'DES-05')] },
      ),
      screen(
        'DES-04',
        'Detalhe de benefício',
        'Como funciona a telemedicina?',
        'O acesso acontece no ambiente do prestador, conforme disponibilidade, limites e carências do plano. Posso mostrar as condições das opções disponíveis.',
        { actions: [action('Comparar opções', 'DES-06'), action('Usar benefício', 'UTI-01')] },
      ),
      screen(
        'DES-05',
        'Opções elegíveis',
        'Quero ver os planos.',
        'Neste exemplo, há duas opções. Escolha uma para ver detalhes ou compare as diferenças.',
        list(
          'Opções de assistência',
          [
            { label: 'Individual', detail: 'R$ 29,90/mês · somente titular', target: 'DES-08' },
            {
              label: 'Familiar',
              detail: 'R$ 39,90/mês · titular e dependentes elegíveis',
              target: 'DES-08',
            },
          ],
          'Ver condições',
        ),
      ),
      screen(
        'DES-06',
        'Comparação neutra',
        'Qual é a diferença entre os planos?',
        '**Individual**\nR$ 29,90/mês · somente titular.\n\n**Familiar**\nR$ 39,90/mês · titular e até 3 dependentes neste exemplo.\n\nOs benefícios, limites e carências precisam ser conferidos nas condições de cada plano.',
        { actions: [action('Ver planos', 'DES-05'), action('Simular para mim', 'DES-07')] },
      ),
      screen(
        'DES-07',
        'Dados para simulação',
        'Quero simular.',
        'Vamos coletar somente os dados necessários para consultar uma opção disponível.',
        form(
          'Simular assistência',
          [
            {
              name: 'composition',
              label: 'Quem você deseja atender?',
              type: 'select',
              choices: ['Selecione', 'Somente eu', 'Eu e outras pessoas'],
              required: true,
            },
          ],
          'Consultar opções',
          'DES-08',
        ),
      ),
      screen(
        'DES-08',
        'Oferta consultada',
        'Quero o Familiar.',
        '**Assistência Saúde Familiar**\nValor total: R$ 39,90/mês.\nComposição deste exemplo: titular e até 3 dependentes elegíveis.\nVocê poderá revisar carências, limites e pagamento antes de contratar.',
        {
          actions: [
            action('Revisar contratação', 'ADE-01'),
            action('Comparar novamente', 'DES-06'),
          ],
        },
      ),
      screen(
        'DES-09',
        'Necessidade incompatível',
        'Isso cobre uma internação?',
        'Esta assistência não cobre procedimentos hospitalares. Ela não atende a essa necessidade. Posso explicar seus benefícios ou verificar outros produtos disponíveis.',
        {
          ...variant(),
          actions: [action('Outros produtos', 'DES-01'), action('Falar com alguém', 'HUM-01')],
        },
      ),
      screen(
        'DES-10',
        'Iniciar contratação',
        'Quero contratar.',
        'Vamos revisar sua identificação, participantes, pagamento e condições antes da confirmação.',
        { actions: [action('Começar contratação', 'ADE-02')] },
      ),
      screen(
        'DES-11',
        'Decisão adiada',
        'Vou pensar.',
        'Tudo bem. Você pode retomar por aqui. Consultaremos novamente preço e condições antes de contratar.',
        { ...variant(), actions: [action('Menu', 'NAV-01')] },
      ),
    ],
  );

  journey(
    'ADE',
    'Contratação',
    'Contratar',
    'Da escolha ao aceite, com participação opcional dos dependentes e resultado confirmado pelo sistema.',
    'Contratar no WhatsApp; dependentes podem entrar depois; resumo e aceite explícito.',
    'Elegibilidade, documentos, cobrança e emissão dependem do produto. Preço fictício de R$ 39,90.',
    [
      screen(
        'ADE-01',
        'Plano escolhido',
        'Quero contratar o Familiar.',
        'Você escolheu Assistência Saúde Familiar. Vamos conferir os dados e condições antes de confirmar.',
        { actions: [action('Continuar', 'ADE-02'), action('Rever planos', 'DES-05')] },
      ),
      screen(
        'ADE-02',
        'Identificação na adesão',
        'Vamos continuar.',
        'Primeiro, precisamos verificar sua identidade. Se sua sessão estiver válida, esta etapa será aproveitada.',
        {
          actions: [
            action('Continuar com autenticação', 'ADE-03'),
            action('Ver identificação', 'IDE-01'),
          ],
        },
      ),
      screen(
        'ADE-03',
        'Dados do titular',
        'Identidade verificada.',
        'Confira os dados do titular necessários à contratação.',
        form(
          'Dados do titular',
          [
            { name: 'holder', label: 'Nome completo', value: 'Ana Silva', required: true },
            {
              name: 'email',
              label: 'E-mail para documentos',
              type: 'email',
              value: 'ana@example.com',
              required: true,
            },
          ],
          'Continuar',
          'ADE-04',
        ),
      ),
      screen(
        'ADE-04',
        'Dependentes agora ou depois',
        'Dados conferidos.',
        'Você pode incluir dependentes agora ou depois. Neste exemplo, o plano permanece R$ 39,90/mês. Cada inclusão terá as condições e datas consultadas naquele momento.',
        { actions: [action('Incluir agora', 'DEP-04'), action('Incluir depois', 'ADE-05')] },
      ),
      screen(
        'ADE-05',
        'Elegibilidade validada',
        'Vou incluir depois.',
        'Os dados do titular foram validados. Vamos consultar os meios de pagamento disponíveis.',
        { actions: [action('Escolher pagamento', 'PAG-02')] },
      ),
      screen(
        'ADE-06',
        'Revisão da contratação',
        'Escolhi o pagamento.',
        'Revise todos os dados e condições. Se precisar corrigir alguma informação, podemos voltar à conversa.',
        review(
          'Revisar contratação',
          [
            {
              title: 'Produto e participantes',
              rows: [
                ['Produto', 'Assistência Saúde'],
                ['Plano', 'Familiar'],
                ['Titular', 'Ana Silva'],
                ['Dependentes agora', 'Nenhum; incluir depois'],
              ],
            },
            {
              title: 'Preço e cobrança',
              rows: [
                ['Total mensal', 'R$ 39,90'],
                ['Meio', 'Cartão cadastrado •• 2048'],
                ['Primeira cobrança', '10/10/2026'],
                ['Recorrência', 'Mensal, mediante autorização'],
              ],
            },
            {
              title: 'Utilização e encerramento',
              rows: [
                ['Início da vigência', 'Após confirmação da emissão'],
                ['Carências e limites', 'Consultar condições do produto'],
                ['Cancelamento', 'Primeira data permitida pelo produto'],
              ],
            },
          ],
          'Ver documentos e aceite',
          'ADE-07',
          {
            correction: 'ADE-03',
            note: 'Assistência não é plano de saúde. Condições ilustrativas, sujeitas à validação.',
          },
        ),
      ),
      screen(
        'ADE-07',
        'Documentos e aceite',
        'Quero revisar os documentos.',
        'Os documentos completos estão disponíveis. O aceite é explícito e não vem pré-marcado.',
        review(
          'Condições e aceite',
          [
            {
              title: 'Resumo',
              rows: [
                ['Produto', 'Assistência Saúde Familiar'],
                ['Valor', 'R$ 39,90/mês'],
                ['Participantes', 'Somente titular nesta etapa'],
              ],
            },
          ],
          'Confirmar contratação',
          'ADE-08',
          {
            documents: ['Termo de adesão', 'Condições do produto'],
            consent:
              'Confirmo os dados e aceito as condições contratuais apresentadas, incluindo a cobrança recorrente indicada.',
            correction: 'ADE-06',
          },
        ),
      ),
      screen(
        'ADE-08',
        'Contratação em processamento',
        'Confirmar contratação',
        'Recebi sua confirmação. Estou verificando o pagamento e a emissão. Você pode acompanhar a solicitação por aqui.',
        {
          actions: [
            action('Consultar resultado', 'ADE-09'),
            action('Minhas solicitações', 'SOL-01'),
          ],
        },
      ),
      screen(
        'ADE-09',
        'Contratação concluída',
        'Qual é o resultado?',
        '**Contratação concluída**\nAssistência Saúde Familiar · ativa.\nVigência: 10/10/2026.\nProtocolo: ADE-2026-2048.\nConsulte as condições de cada benefício antes de utilizar.',
        {
          actions: [
            action('Ver documentos', 'CON-07'),
            action('Incluir dependente', 'DEP-01'),
            action('Usar benefícios', 'UTI-01'),
          ],
        },
      ),
      screen(
        'ADE-10',
        'Primeiros passos',
        'O que faço agora?',
        'Você pode consultar seus benefícios, incluir dependentes ou acessar os documentos. A disponibilidade de cada benefício aparece na consulta de utilização.',
        { actions: [action('Ver benefícios', 'UTI-01'), action('Gerenciar contrato', 'CON-02')] },
      ),
      screen(
        'ADE-11',
        'Pessoa inelegível',
        'Posso continuar?',
        'Uma condição de elegibilidade não foi atendida neste exemplo. Vou mostrar o critério informado pelo sistema antes de prosseguir.',
        {
          ...variant(),
          actions: [action('Rever dados', 'ADE-03'), action('Pedir esclarecimento', 'HUM-01')],
        },
      ),
      screen(
        'ADE-12',
        'Condições alteradas',
        'Quero confirmar.',
        'As condições da oferta mudaram desde sua última revisão. Você precisa conferir a oferta atualizada antes de contratar.',
        {
          ...variant(),
          actions: [action('Revisar oferta', 'ADE-06'), action('Deixar para depois', 'DES-11')],
        },
      ),
      screen(
        'ADE-13',
        'Emissão ainda pendente',
        'O pagamento foi confirmado?',
        'O pagamento está confirmado, mas a emissão ainda está em processamento. Não há confirmação de contrato emitido neste momento.',
        {
          ...variant(),
          actions: [action('Acompanhar pedido', 'SOL-04'), action('Pedir ajuda', 'HUM-01')],
        },
      ),
    ],
  );

  journey(
    'PAG',
    'Pagamento da contratação',
    'Contratar',
    'Escolha de meio elegível, autorização segura e tratamento de tentativas pendentes.',
    'Preservar contratação e oferecer nova tentativa ou outro meio disponível.',
    'Meios ilustrativos: não pressupõem suporte real. Dados completos de cartão não são solicitados no chat.',
    [
      screen(
        'PAG-01',
        'Consultar meios elegíveis',
        'Como posso pagar?',
        'Vou consultar os meios disponíveis para este produto e seu cadastro.',
        { actions: [action('Ver opções', 'PAG-02')] },
      ),
      screen(
        'PAG-02',
        'Escolher pagamento',
        'Quero ver as opções.',
        'Escolha um meio disponível. A autorização para cobrança recorrente será apresentada antes de concluir.',
        list(
          'Pagamento',
          [
            {
              label: 'Cartão cadastrado',
              detail: 'Final 2048 · cobrança mensal autorizada no aceite',
              target: 'PAG-04',
            },
            {
              label: 'Outro meio disponível',
              detail: 'Exemplo de integração segura com a instituição',
              target: 'PAG-03',
            },
          ],
          'Continuar',
        ),
      ),
      screen(
        'PAG-03',
        'Etapa segura externa',
        'Quero usar outro meio.',
        'A autorização acontece no ambiente seguro da instituição. Sua contratação está salva e o resultado será consultado ao retornar.',
        {
          actions: [
            action('Abrir demonstração segura', 'PAG-04'),
            action('Retornar depois', 'RET-01'),
          ],
          behavior:
            'Ação simula o retorno da etapa segura; não abre processadora ou coleta dados de cartão.',
        },
      ),
      screen(
        'PAG-04',
        'Revisar cobrança',
        'Cartão final 2048.',
        'Confira a cobrança recorrente antes de continuar.',
        review(
          'Revisar pagamento',
          [
            {
              title: 'Cobrança',
              rows: [
                ['Total', 'R$ 39,90/mês'],
                ['Meio escolhido', 'Cartão •• 2048'],
                ['Primeira cobrança', '10/10/2026'],
                ['Recorrência', 'Mensal'],
              ],
            },
          ],
          'Continuar para revisão',
          'ADE-06',
        ),
      ),
      screen(
        'PAG-05',
        'Autorização pendente',
        'Já foi autorizado?',
        'A autorização ainda está em processamento. Vou consultar o resultado antes de permitir uma nova tentativa.',
        { actions: [action('Consultar resultado', 'PAG-06'), action('Acompanhar', 'SOL-04')] },
      ),
      screen(
        'PAG-06',
        'Pagamento confirmado',
        'Consultar resultado',
        'Pagamento confirmado. A contratação só será apresentada como concluída quando a emissão também estiver confirmada.',
        { actions: [action('Ver contratação', 'ADE-09')] },
      ),
      screen(
        'PAG-07',
        'Tentativa não concluída',
        'Meu pagamento falhou.',
        'O pagamento não foi concluído. Os dados da contratação estão salvos. Você pode tentar novamente ou escolher outro meio disponível.',
        {
          ...variant(),
          actions: [
            action('Tentar novamente', 'PAG-04'),
            action('Trocar pagamento', 'PAG-02'),
            action('Pedir ajuda', 'HUM-01'),
          ],
        },
      ),
      screen(
        'PAG-08',
        'Nenhum meio elegível',
        'Quero pagar.',
        'Não há um meio de pagamento elegível disponível neste momento. Podemos registrar um pedido de atendimento.',
        { ...variant(), actions: [action('Solicitar atendimento', 'HUM-08')] },
      ),
      screen(
        'PAG-09',
        'Retorno após abandono',
        'Fechei a página de pagamento.',
        'Sua contratação está salva. Primeiro vamos consultar se houve autorização antes de retomar.',
        { ...variant(), actions: [action('Consultar tentativa', 'PAG-05')] },
      ),
      screen(
        'PAG-10',
        'Pagamento duplicado evitado',
        'Cliquei duas vezes.',
        'Há uma tentativa vinculada à sua solicitação. Vou consultar essa operação, sem criar outra cobrança.',
        { ...variant(), actions: [action('Ver resultado', 'PAG-05')] },
      ),
    ],
  );

  journey(
    'CON',
    'Meu contrato e documentos',
    'Consultar',
    'Resumo primeiro, com acesso contextual a benefícios, gestão e documentos.',
    'Se houver vários contratos, selecionar antes. Contrato ativo não garante todos os benefícios liberados.',
    'Situações, vigência, documentos e retenção de histórico dependem do produto.',
    [
      screen(
        'CON-01',
        'Escolher contrato',
        'Quero ver meu contrato.',
        'Qual contrato você deseja consultar?',
        list('Meus contratos', contracts, 'Ver resumo'),
      ),
      screen(
        'CON-02',
        'Resumo ativo',
        'Assistência Saúde',
        '**Assistência Saúde · Familiar**\nSituação: ativa.\nVigência: desde 10/10/2026.\nMensalidade: R$ 39,90.\nPessoas vinculadas: titular e 1 dependente.\nConsulte carências e limites ao usar cada benefício.',
        {
          actions: [
            action('Usar benefícios', 'UTI-01'),
            action('Gerenciar contrato', 'NAV-02'),
            action('Ver documentos', 'CON-07'),
          ],
        },
      ),
      screen(
        'CON-03',
        'Aguardando ativação',
        'Já posso usar?',
        'Seu contrato está aguardando ativação. A utilização depende da confirmação e das condições de cada benefício.',
        {
          ...variant(),
          actions: [action('Acompanhar emissão', 'SOL-04'), action('Pedir ajuda', 'HUM-01')],
        },
      ),
      screen(
        'CON-04',
        'Restrição ou suspensão',
        'Minha assistência está ativa?',
        'Há uma restrição registrada no contrato. Consulte o motivo e as ações disponíveis antes de utilizar os benefícios.',
        {
          ...variant(),
          actions: [
            action('Consultar pendências', 'COB-01'),
            action('Pedir esclarecimento', 'HUM-01'),
          ],
        },
      ),
      screen(
        'CON-05',
        'Cancelamento agendado',
        'Quero ver minha assistência.',
        'Seu cancelamento está agendado para 10/11/2026 neste exemplo. Os benefícios permanecem conforme as condições informadas até a data efetiva.',
        { actions: [action('Ver cancelamento', 'CAN-09'), action('Ver documentos', 'CON-07')] },
      ),
      screen(
        'CON-06',
        'Contrato encerrado',
        'Assistência Saúde encerrado',
        'Este contrato foi encerrado em 10/09/2026. Você pode consultar documentos e solicitações ainda disponíveis.',
        {
          ...variant(),
          actions: [
            action('Ver documentos', 'CON-07'),
            action('Minhas solicitações', 'SOL-02'),
            action('Conhecer produtos', 'DES-01'),
          ],
        },
      ),
      screen(
        'CON-07',
        'Documentos disponíveis',
        'Quero os documentos.',
        'Estes são os documentos disponíveis para o contrato selecionado.',
        {
          mode: 'document',
          documents: ['Termo de adesão', 'Condições do produto', 'Comprovante de contratação'],
          actions: [action('Voltar ao contrato', 'CON-02')],
        },
      ),
      screen(
        'CON-08',
        'Documento em geração',
        'Não encontrei o termo.',
        'O documento ainda está sendo gerado. A solicitação permanece disponível para acompanhamento.',
        {
          ...variant(),
          actions: [action('Acompanhar', 'SOL-04'), action('Pedir ajuda', 'HUM-01')],
        },
      ),
      screen(
        'CON-09',
        'Nenhum contrato',
        'Meus contratos',
        'Não há contratos disponíveis para esta identidade. Você pode acompanhar uma contratação em andamento ou conhecer os produtos.',
        {
          ...variant(),
          actions: [action('Ver solicitação', 'SOL-08'), action('Conhecer produtos', 'DES-01')],
        },
      ),
      screen(
        'CON-10',
        'Consulta indisponível',
        'Consultar contrato',
        'Não foi possível consultar o contrato agora. Tente novamente ou solicite ajuda. Nenhuma alteração foi realizada.',
        {
          ...variant(),
          actions: [action('Tentar novamente', 'CON-01'), action('Pedir ajuda', 'HUM-01')],
        },
      ),
      screen(
        'CON-11',
        'Troca de plano visível',
        'Quero ver meu plano.',
        '**Plano atual:** Familiar · R$ 39,90/mês.\n**Próximo plano:** Individual · R$ 29,90/mês.\nTroca agendada para 10/11/2026 neste exemplo. Até lá, permanece válido o plano atual.',
        { actions: [action('Ver agendamento', 'PLA-10'), action('Ver documentos', 'CON-07')] },
      ),
    ],
  );

  journey(
    'DEP',
    'Incluir e corrigir dependentes',
    'Gerenciar',
    'Jornada piloto: coleta conversacional, revisão estruturada e confirmação de uma pessoa por vez.',
    'Somente titular. Correções pela conversa, inclusive após inclusão quando permitido.',
    'Campos obrigatórios, vagas, carências e custos precisam ser validados. O exemplo tem titular + até 3 dependentes.',
    [
      screen(
        'DEP-01',
        'Pedido de inclusão',
        'Quero incluir minha filha.',
        'Posso ajudar. Vou verificar sua identidade, o contrato e as condições para inclusão.',
        { actions: [action('Continuar inclusão', 'DEP-02')] },
      ),
      screen(
        'DEP-02',
        'Identificar contrato',
        'Minha sessão está válida.',
        'Para qual contrato deseja incluir sua filha?',
        list(
          'Selecionar assistência',
          [
            {
              label: 'Assistência Saúde Familiar',
              detail: 'Ativa · contrato final 2048',
              target: 'DEP-03',
            },
          ],
          'Continuar',
        ),
      ),
      screen(
        'DEP-03',
        'Consultar vagas e condições',
        'Assistência Saúde Familiar',
        'Você tem 2 vagas disponíveis neste exemplo. Pode informar os dados pela conversa ou preencher um formulário. Mostraremos as condições antes de confirmar.',
        {
          actions: [
            action('Informar na conversa', 'DEP-33'),
            action('Preencher formulário', 'DEP-05'),
          ],
        },
      ),
      screen(
        'DEP-33',
        'Mensagem única · dados compreendidos',
        'Oi, quero incluir meu filho João da Silva no plano. O CPF dele é 123.456.789-10 e ele nasceu em 12/03/2004.',
        'Entendi os dados do João:\n\n**Nome:** João da Silva\n**CPF:** •••.•••.•••-10\n**Nascimento:** 12/03/2004\n**Parentesco:** filho\n\nPara concluir o cadastro legado, preciso perguntar o celular e o sexo biológico. Não vou deduzir nenhum deles pelo nome.',
        {
          seed: {
            name: 'João da Silva',
            birth: '12/03/2004',
            maskedDocument: '•••.•••.•••-10',
            relationship: 'Filho',
          },
          actions: [action('Informar dados que faltam', 'DEP-34'), action('Corrigir dados', 'DEP-14')],
          behavior:
            'Uma única mensagem fornece nome, CPF, nascimento e parentesco. O assistente aproveita os dados e pergunta apenas campos legados obrigatórios que faltarem — celular e sexo biológico são sempre perguntados explicitamente, nunca inferidos. A inclusão exige revisão e confirmação.',
          rule: 'Exemplo baseado no slide. Celular e sexo biológico constam do legado; confirmar com produto se continuam obrigatórios. Nunca inferir sexo ou gênero pelo nome ou parentesco.',
        },
      ),
      screen(
        'DEP-34',
        'Completar dados do dependente',
        'Quero concluir o cadastro.',
        'Qual é o celular do João e qual sexo biológico ele informa? Esses dados não são inferidos. Use apenas dados fictícios nesta demonstração.',
        form('Dados complementares', [
          { name: 'phone', label: 'Celular do dependente', type: 'tel', placeholder: '(00) 00000-0000', required: true },
          { name: 'biologicalSex', label: 'Sexo biológico informado', type: 'select', choices: ['Selecione', 'Feminino', 'Masculino', 'Prefiro não informar'], required: true },
        ], 'Revisar inclusão', 'DEP-06', { note: 'O legado solicita estes dados. Obrigatoriedade e opções precisam ser validadas pelo produto.', rule: 'Sexo biológico e celular são perguntados explicitamente e não são inferidos. A necessidade e a obrigatoriedade destes campos ainda dependem de validação do produto.' }),
      ),
      screen(
        'DEP-04',
        'Coleta pela conversa',
        'Minha filha é Maria Silva, nasceu em 12/03/2014.',
        'Recebi o nome, a data de nascimento e o parentesco. Falta o CPF exigido neste exemplo. Você pode informar por aqui.',
        {
          actions: [
            action('Simular dado informado', 'DEP-06'),
            action('Preencher formulário', 'DEP-05'),
          ],
        },
      ),
      screen(
        'DEP-05',
        'Formulário de inclusão',
        'Prefiro o formulário.',
        'Preencha os dados da pessoa que será incluída. Você poderá revisar tudo antes de confirmar.',
        form('Incluir dependente', dependentFields, 'Revisar inclusão', 'DEP-06', {
          note: 'Use dados fictícios. Campos ilustrativos, sujeitos à validação do produto.',
        }),
      ),
      screen(
        'DEP-06',
        'Revisar pessoa e condições',
        'Já informei os dados.',
        'Confira os dados e os efeitos da inclusão. Correções são feitas pela conversa.',
        review('Revisar inclusão', dependentReview(), 'Confirmar inclusão', 'DEP-08', {
          correction: 'DEP-14',
          note: 'Confira a disponibilidade de cada benefício nas condições do produto.',
        }),
      ),
      screen(
        'DEP-07',
        'Confirmação explícita',
        'Os dados estão corretos.',
        'A inclusão só será enviada após sua confirmação do resumo apresentado.',
        {
          actions: [
            action('Revisar e confirmar', 'DEP-06'),
            action('Desistir do pedido', 'NAV-04'),
          ],
        },
      ),
      screen(
        'DEP-08',
        'Inclusão em processamento',
        'Confirmar inclusão',
        'Recebi sua confirmação. Estou verificando o resultado da inclusão. Não é necessário enviar o pedido novamente.',
        {
          actions: [action('Consultar resultado', 'DEP-09'), action('Acompanhar pedido', 'SOL-04')],
        },
      ),
      screen(
        'DEP-09',
        'Inclusão concluída',
        'Consultar resultado',
        '**Inclusão concluída**\n{{name}} está vinculada à Assistência Saúde Familiar.\nData efetiva: 10/10/2026.\nProtocolo: DEP-2026-0318.\nA utilização segue as condições de cada benefício.',
        {
          actions: [
            action('Ver benefícios', 'UTI-01'),
            action('Incluir outra pessoa', 'DEP-12'),
            action('Ver contrato', 'CON-02'),
          ],
        },
      ),
      screen(
        'DEP-10',
        'Lista de participantes',
        'Quem está no meu plano?',
        '**Pessoas vinculadas**\nAna Silva · titular.\n{{name}} · filha.\nVagas disponíveis neste exemplo: 2.\nA disponibilidade para inclusão é consultada novamente a cada pedido.',
        {
          actions: [
            action('Incluir pessoa', 'DEP-01'),
            action('Excluir pessoa', 'EXC-01'),
            action('Corrigir cadastro', 'DEP-18'),
          ],
        },
      ),
      screen(
        'DEP-11',
        'Várias pessoas informadas',
        'Quero incluir João e Maria.',
        'Vamos incluir uma pessoa por vez para conferir os dados e condições. Preservei as informações recebidas. Por quem começamos?',
        { actions: [action('João', 'DEP-04'), action('Maria', 'DEP-04')] },
      ),
      screen(
        'DEP-12',
        'Próxima inclusão',
        'Quero continuar com outra pessoa.',
        'Vamos consultar novamente as vagas e condições após o resultado da inclusão anterior.',
        { actions: [action('Continuar', 'DEP-03'), action('Deixar para depois', 'DEP-13')] },
      ),
      screen(
        'DEP-13',
        'Sequência interrompida',
        'Vou continuar depois.',
        'A inclusão de Maria foi concluída. João ainda não foi incluído. Podemos retomar a solicitação pendente quando você voltar.',
        { ...variant(), actions: [action('Ver solicitações', 'SOL-02')] },
      ),
      screen(
        'DEP-14',
        'Solicitar correção',
        'Corrigir dados',
        'Qual informação você quer corrigir? Podemos alterar apenas esse dado e preservar o restante.',
        { actions: [action('Simular correção de data', 'DEP-16')] },
      ),
      screen(
        'DEP-15',
        'Correção ambígua',
        'Troque para minha outra filha.',
        'Você quer substituir a pessoa desta solicitação ou corrigir um dado de Maria?',
        {
          ...variant(),
          actions: [
            action('Substituir pessoa do pedido', 'DEP-04'),
            action('Corrigir um dado', 'DEP-14'),
          ],
        },
      ),
      screen(
        'DEP-16',
        'Revalidar após correção',
        'A data correta é 12/03/2014.',
        'Atualizei a data informada. Vou verificar novamente a elegibilidade e as condições da inclusão.',
        { actions: [action('Ver revisão atualizada', 'DEP-17')] },
      ),
      screen(
        'DEP-17',
        'Nova revisão',
        'Revisar novamente',
        'O resumo abaixo contém os dados atualizados. Sua confirmação valerá para esta revisão.',
        review('Revisão atualizada', dependentReview(), 'Confirmar inclusão', 'DEP-08', {
          correction: 'DEP-14',
        }),
      ),
      screen(
        'DEP-18',
        'Correção após conclusão',
        'Cadastrei a data errada.',
        'Para qual dependente deseja solicitar a correção?',
        list(
          'Corrigir dependente',
          [{ label: 'Maria Silva', detail: 'Filha · inclusão concluída', target: 'DEP-19' }],
          'Continuar',
        ),
      ),
      screen(
        'DEP-19',
        'Entender correção',
        'Maria Silva',
        'Qual informação precisa mudar e qual é o dado correto?',
        { actions: [action('Simular correção informada', 'DEP-20')] },
      ),
      screen(
        'DEP-20',
        'Verificar alteração permitida',
        'O nascimento correto é 12/03/2014.',
        'Vou consultar se esse dado pode ser alterado e quais efeitos a correção terá.',
        {
          actions: [
            action('Revisar alteração permitida', 'DEP-21'),
            action('Ver caso com análise', 'DEP-24'),
          ],
        },
      ),
      screen(
        'DEP-21',
        'Revisar correção',
        'Quero revisar.',
        'Confira a alteração e seus efeitos antes de confirmar.',
        review(
          'Corrigir cadastro',
          [
            {
              title: 'Alteração solicitada',
              rows: [
                ['Pessoa', 'Maria Silva'],
                ['Campo', 'Nascimento'],
                ['Dado registrado', '12/03/2015'],
                ['Dado correto', '12/03/2014'],
                ['Efeito neste exemplo', 'Sem alteração de preço'],
              ],
            },
          ],
          'Confirmar correção',
          'DEP-23',
          { correction: 'DEP-19' },
        ),
      ),
      screen(
        'DEP-22',
        'Confirmação da correção',
        'Confirmo o dado correto.',
        'Sua decisão precisa corresponder à revisão atualizada. Podemos conferir novamente antes de enviar.',
        { actions: [action('Revisar e confirmar', 'DEP-21')] },
      ),
      screen(
        'DEP-23',
        'Correção concluída',
        'Confirmar correção',
        'Correção concluída. A data de nascimento foi atualizada no cadastro de Maria.\nProtocolo: COR-2026-0181.',
        { actions: [action('Ver participantes', 'DEP-10'), action('Ver documentos', 'CON-07')] },
      ),
      screen(
        'DEP-24',
        'Correção exige análise',
        'Preciso alterar o CPF.',
        'Esta alteração exige análise. Vou registrar a informação correta e vincular o pedido à inclusão original. Trocar a pessoa não será tratado automaticamente como correção.',
        {
          ...variant(),
          actions: [action('Registrar pedido', 'HUM-08'), action('Acompanhar', 'SOL-03')],
        },
      ),
      screen(
        'DEP-25',
        'Sem vagas disponíveis',
        'Quero incluir mais uma pessoa.',
        'Não há vagas disponíveis neste contrato. Você pode consultar os participantes ou verificar alternativas permitidas.',
        {
          ...variant(),
          actions: [action('Ver participantes', 'DEP-10'), action('Ver planos', 'PLA-02')],
        },
      ),
      screen(
        'DEP-26',
        'Pessoa já vinculada',
        'Quero incluir Maria.',
        'Maria já está vinculada a este contrato. Você pode consultar seus benefícios ou corrigir um dado.',
        {
          ...variant(),
          actions: [action('Ver benefícios', 'UTI-01'), action('Corrigir cadastro', 'DEP-18')],
        },
      ),
      screen(
        'DEP-27',
        'Dados inválidos',
        'Informei um CPF.',
        'Não foi possível validar o CPF informado. Confira o documento e envie a correção. Os outros dados estão preservados.',
        { ...variant(), actions: [action('Corrigir pela conversa', 'DEP-14')] },
      ),
      screen(
        'DEP-28',
        'Pessoa inelegível',
        'Posso confirmar a inclusão?',
        'A pessoa não atende ao critério de elegibilidade retornado pelo produto neste exemplo. Podemos revisar os dados ou pedir esclarecimento.',
        {
          ...variant(),
          actions: [action('Revisar dados', 'DEP-14'), action('Pedir esclarecimento', 'HUM-01')],
        },
      ),
      screen(
        'DEP-29',
        'Restrição de substituição',
        'Quero preencher a vaga que liberei.',
        'Existe uma restrição de nova inclusão após a exclusão anterior. A data e o alcance dessa restrição precisam ser consultados nas regras do produto.',
        {
          ...variant(),
          actions: [action('Ver exclusão', 'EXC-06'), action('Pedir esclarecimento', 'HUM-01')],
        },
      ),
      screen(
        'DEP-30',
        'Inclusão agendada',
        'Foi incluída?',
        'A inclusão foi aceita e está agendada para a data informada pelo produto. Ainda não há confirmação de benefício disponível.\nProtocolo: DEP-2026-0320.',
        { ...variant(), actions: [action('Acompanhar agendamento', 'SOL-05')] },
      ),
      screen(
        'DEP-31',
        'Falha de processamento',
        'Deu certo?',
        'Não foi possível confirmar o resultado. Vamos consultar a solicitação original antes de tentar novamente.',
        {
          ...variant(),
          actions: [action('Consultar solicitação', 'SOL-04'), action('Pedir ajuda', 'HUM-01')],
        },
      ),
      screen(
        'DEP-32',
        'Somente titular pode gerenciar',
        'Sou dependente e quero incluir minha irmã.',
        'A gestão de dependentes precisa ser realizada pelo titular. Você pode consultar o acesso aos seus próprios benefícios quando o produto permitir.',
        {
          ...variant(),
          actions: [
            action('Consultar meus benefícios', 'UTI-01'),
            action('Informações gerais', 'ENT-04'),
          ],
        },
      ),
    ],
  );

  journey(
    'EXC',
    'Excluir dependentes',
    'Gerenciar',
    'Escolha da pessoa, efeitos claros e confirmação direta, sem etapa de retenção.',
    'Somente titular; agendamento pode ser desfeito quando permitido.',
    'Data efetiva, redução de preço e restrição de substituição dependem do produto; regra legada de 180 dias não foi generalizada.',
    [
      screen(
        'EXC-01',
        'Selecionar dependente',
        'Quero excluir a Maria.',
        'Vou conferir a pessoa e as condições antes de apresentar a confirmação.',
        list(
          'Excluir dependente',
          [
            { label: 'Maria Silva', detail: 'CPF: •••.•••.•••-09 · Filha · vínculo ativo', target: 'EXC-02' },
            { label: 'João Silva', detail: 'CPF: •••.•••.•••-10 · Filho · vínculo ativo', target: 'EXC-02' },
          ],
          'Consultar efeitos',
        ),
      ),
      screen(
        'EXC-02',
        'Consultar condições',
        'Maria Silva',
        'Vou consultar a data efetiva, os efeitos financeiros e a possibilidade de novas inclusões.',
        { actions: [action('Revisar exclusão', 'EXC-03')] },
      ),
      screen(
        'EXC-03',
        'Revisar efeitos',
        'Quero revisar.',
        'Confira os efeitos antes de excluir.',
        review(
          'Excluir dependente',
          [
            {
              title: 'Pessoa e efeitos',
              rows: [
                ['Pessoa', 'Maria Silva'],
                ['Exclusão efetiva', '10/11/2026 neste exemplo'],
                ['Acesso aos benefícios', 'Até a data efetiva, conforme regras'],
                ['Mensalidade', 'Sem redução neste exemplo'],
                ['Nova inclusão', 'Conforme restrições do produto'],
              ],
            },
          ],
          'Confirmar exclusão',
          'EXC-05',
          { secondaryLabel: 'Manter dependente', correction: 'DEP-10' },
        ),
      ),
      screen(
        'EXC-04',
        'Confirmação direta',
        'Quero excluir.',
        'A confirmação deve ocorrer após a revisão da data e dos efeitos da exclusão.',
        {
          actions: [action('Revisar e confirmar', 'EXC-03'), action('Manter dependente', 'DEP-10')],
        },
      ),
      screen(
        'EXC-05',
        'Processar exclusão',
        'Confirmar exclusão',
        'Recebi sua confirmação. Estou verificando o resultado.',
        { actions: [action('Consultar resultado', 'EXC-06')] },
      ),
      screen(
        'EXC-06',
        'Resultado da exclusão',
        'Consultar resultado',
        'A exclusão de Maria está agendada para 10/11/2026 neste exemplo.\nProtocolo: EXC-2026-0091.\nA vaga só será apresentada como utilizável quando as regras permitirem.',
        { actions: [action('Ver agendamento', 'EXC-08'), action('Ver contrato', 'EXC-07')] },
      ),
      screen(
        'EXC-07',
        'Contrato atualizado',
        'Ver contrato',
        'Maria permanece vinculada até a data efetiva. A disponibilidade para nova inclusão será consultada novamente.',
        {
          actions: [
            action('Ver participantes', 'DEP-10'),
            action('Incluir outra pessoa', 'DEP-03'),
          ],
        },
      ),
      screen(
        'EXC-08',
        'Agendamento visível',
        'Quero ver a exclusão.',
        'Exclusão de Maria agendada para 10/11/2026. Você pode pedir para desfazer enquanto a operação permitir.',
        { actions: [action('Desfazer exclusão', 'EXC-09'), action('Ver detalhes', 'SOL-05')] },
      ),
      screen(
        'EXC-09',
        'Revisar desistência',
        'Quero desfazer.',
        'Vou verificar o agendamento. Neste exemplo, Maria permanece vinculada e não há ajuste de preço para desfazer.',
        {
          actions: [
            action('Confirmar manutenção', 'EXC-10'),
            action('Manter agendamento', 'EXC-08'),
          ],
        },
      ),
      screen(
        'EXC-10',
        'Confirmar manutenção',
        'Confirmar manutenção',
        'Sua confirmação será vinculada ao agendamento atual.',
        { actions: [action('Consultar resultado', 'EXC-11')] },
      ),
      screen(
        'EXC-11',
        'Agendamento desfeito',
        'Consultar resultado',
        'O agendamento de exclusão foi desfeito. Maria permanece vinculada à Assistência Saúde Familiar.\nProtocolo: EXC-2026-0092.',
        { actions: [action('Ver participantes', 'DEP-10')] },
      ),
      screen(
        'EXC-12',
        'Exclusão já efetivada',
        'Quero desfazer a exclusão.',
        'A exclusão já foi efetivada. Podemos verificar uma nova inclusão, conforme vagas e regras atuais.',
        {
          ...variant(),
          actions: [action('Consultar inclusão', 'DEP-03'), action('Pedir ajuda', 'HUM-01')],
        },
      ),
      screen(
        'EXC-13',
        'Desistência impedida ou pendente',
        'Pode manter Maria?',
        'Não foi possível confirmar a desistência do agendamento. O pedido precisa ser acompanhado antes de considerar o vínculo mantido.',
        {
          ...variant(),
          actions: [action('Acompanhar', 'SOL-04'), action('Pedir ajuda', 'HUM-01')],
        },
      ),
      screen(
        'EXC-14',
        'Pessoa já excluída',
        'Excluir Maria',
        'Maria já foi excluída deste contrato. Você pode consultar o comprovante e a data efetiva.',
        { ...variant(), actions: [action('Ver pedido', 'SOL-06')] },
      ),
    ],
  );

  journey(
    'PLA',
    'Troca de plano',
    'Gerenciar',
    'Comparação entre plano atual e alternativas, com mudança no próximo ciclo de cobrança.',
    'Autosserviço; nenhuma pessoa removida automaticamente; efeitos revisados antes de confirmar.',
    'Planos elegíveis, data do ciclo, carências e compatibilidade de participantes dependem do produto.',
    [
      screen(
        'PLA-01',
        'Identificar plano atual',
        'Quero mudar meu plano.',
        'Seu plano atual é Familiar. Vou consultar as opções de troca disponíveis.',
        { actions: [action('Ver alternativas', 'PLA-02')] },
      ),
      screen(
        'PLA-02',
        'Alternativas elegíveis',
        'Quero uma opção mais barata.',
        'Estas são as opções elegíveis. Você decide após comparar os efeitos.',
        list(
          'Trocar plano',
          [
            { label: 'Individual', detail: 'R$ 29,90/mês · somente titular', target: 'PLA-03' },
            {
              label: 'Manter Familiar',
              detail: 'R$ 39,90/mês · composição familiar',
              target: 'CON-02',
            },
          ],
          'Comparar',
        ),
      ),
      screen(
        'PLA-03',
        'Comparação com plano atual',
        'Quero comparar o Individual.',
        '**Atual: Familiar**\nR$ 39,90/mês · inclui dependentes elegíveis.\n\n**Alternativa: Individual**\nR$ 29,90/mês · somente titular.\n\nA troca começa no próximo ciclo. Precisamos verificar seus participantes antes de continuar.',
        { actions: [action('Ver participantes', 'PLA-04'), action('Rever opções', 'PLA-02')] },
      ),
      screen(
        'PLA-04',
        'Compatibilidade de participantes',
        'Tenho uma dependente.',
        'Maria está vinculada ao plano atual. O Individual não comporta dependentes. Nenhuma pessoa será removida automaticamente.',
        { actions: [action('Ver opções de ajuste', 'PLA-05'), action('Manter plano', 'CON-02')] },
      ),
      screen(
        'PLA-05',
        'Resolver incompatibilidade',
        'Como posso continuar?',
        'Para esta troca, é necessário resolver o vínculo da dependente conforme as regras. Você pode consultar a exclusão ou escolher outra alternativa.',
        {
          ...variant(),
          actions: [action('Consultar exclusão', 'EXC-01'), action('Rever planos', 'PLA-02')],
        },
      ),
      screen(
        'PLA-06',
        'Revisar troca elegível',
        'Os participantes estão compatíveis.',
        'Confira o novo plano e a data antes de confirmar.',
        review(
          'Revisar troca de plano',
          [
            {
              title: 'Plano e preço',
              rows: [
                ['Atual', 'Familiar · R$ 39,90/mês'],
                ['Novo', 'Individual · R$ 29,90/mês'],
                ['Participantes', 'Somente titular neste cenário'],
              ],
            },
            {
              title: 'Efeitos',
              rows: [
                ['Data efetiva', '10/11/2026'],
                ['Primeira nova cobrança', '10/11/2026'],
                ['Até a mudança', 'Permanece o plano atual'],
                ['Carências', 'Conforme condições consultadas'],
              ],
            },
          ],
          'Confirmar troca',
          'PLA-08',
          { correction: 'PLA-02' },
        ),
      ),
      screen(
        'PLA-07',
        'Confirmar troca',
        'Quero confirmar.',
        'Vamos revisar as condições vigentes antes de enviar a alteração.',
        { actions: [action('Revisar e confirmar', 'PLA-06')] },
      ),
      screen(
        'PLA-08',
        'Processar troca',
        'Confirmar troca',
        'Recebi sua confirmação. Estou verificando o agendamento da troca.',
        { actions: [action('Consultar resultado', 'PLA-09')] },
      ),
      screen(
        'PLA-09',
        'Resultado registrado',
        'Consultar resultado',
        'Troca registrada. O resultado e a data do agendamento estão disponíveis para consulta.\nProtocolo: PLA-2026-0172.',
        { actions: [action('Ver agendamento', 'PLA-10')] },
      ),
      screen(
        'PLA-10',
        'Troca agendada',
        'Quando muda?',
        'Sua troca para Individual está agendada para 10/11/2026. Até lá, permanece válido o Familiar. A cobrança de R$ 29,90 começa no próximo ciclo.',
        { actions: [action('Ver meu contrato', 'CON-11'), action('Acompanhar pedido', 'SOL-05')] },
      ),
      screen(
        'PLA-11',
        'Troca efetivada',
        'A troca aconteceu?',
        'A troca foi efetivada. Seu plano agora é Individual. Os documentos atualizados estão disponíveis.',
        { actions: [action('Ver documentos', 'CON-07'), action('Ver contrato', 'CON-02')] },
      ),
      screen(
        'PLA-12',
        'Falha na efetivação',
        'Meu plano mudou?',
        'Não foi possível confirmar a efetivação da troca. Consulte a situação atual do contrato ou solicite atendimento.',
        {
          ...variant(),
          actions: [action('Consultar contrato', 'CON-02'), action('Pedir ajuda', 'HUM-01')],
        },
      ),
      screen(
        'PLA-13',
        'Nenhuma alternativa',
        'Quero mudar.',
        'Não há alternativas elegíveis para este contrato neste momento. Posso explicar as condições atuais ou encaminhar sua dúvida.',
        {
          ...variant(),
          actions: [action('Ver contrato', 'CON-02'), action('Pedir ajuda', 'HUM-01')],
        },
      ),
    ],
  );

  journey(
    'CAD',
    'Atualização cadastral',
    'Gerenciar',
    'Proposta visual para solicitar correções de cadastro sem perder o contexto do contrato.',
    'Direção ainda não escolhida no brainstorming: proposta de coleta e revisão, sem prometer execução automática.',
    'Quais campos são editáveis, método de comprovação e autorização ainda estão abertos.',
    [
      screen(
        'CAD-01',
        'Solicitar atualização',
        'Mudei de endereço.',
        'Posso reunir os dados da atualização e verificar como este pedido deve ser tratado.',
        { actions: [action('Informar endereço', 'CAD-02'), action('Pedir atendimento', 'HUM-01')] },
      ),
      screen(
        'CAD-02',
        'Coletar cadastro',
        'Quero informar o novo endereço.',
        'Preencha o endereço desejado. A possibilidade de atualização será verificada.',
        form(
          'Novo endereço',
          [
            { name: 'postal', label: 'CEP', placeholder: '00000-000', required: true },
            {
              name: 'address',
              label: 'Endereço e número',
              placeholder: 'Rua, número',
              required: true,
            },
            { name: 'city', label: 'Cidade e estado', placeholder: 'Cidade / UF', required: true },
          ],
          'Revisar pedido',
          'CAD-03',
        ),
      ),
      screen(
        'CAD-03',
        'Revisar pedido',
        'Quero revisar.',
        'Confira os dados que serão enviados para verificação.',
        review(
          'Solicitar atualização',
          [
            {
              title: 'Novo endereço',
              rows: [
                ['CEP', '{{postal}}'],
                ['Endereço', '{{address}}'],
                ['Cidade e estado', '{{city}}'],
              ],
            },
          ],
          'Enviar solicitação',
          'CAD-04',
          { correction: 'CAD-02' },
        ),
      ),
      screen(
        'CAD-04',
        'Pedido em análise',
        'Enviar solicitação',
        'Solicitação recebida para verificação. A atualização ainda não foi confirmada.\nProtocolo: CAD-2026-0041.',
        { actions: [action('Acompanhar pedido', 'SOL-04')] },
      ),
    ],
  );

  journey(
    'UTI',
    'Utilizar benefícios',
    'Utilizar',
    'Verificar a pessoa, o benefício e a disponibilidade antes do acesso ao prestador.',
    'Iniciar pelo WhatsApp. Link disponibilizado não comprova atendimento realizado.',
    'Acessos, limites, carências e integrações ainda precisam de confirmação por prestador.',
    [
      screen(
        'UTI-01',
        'Identificar benefício',
        'Preciso usar minha assistência.',
        'Qual benefício você precisa acessar?',
        list(
          'Usar benefícios',
          [
            {
              label: 'Telemedicina',
              detail: 'Consultar disponibilidade e acessar o prestador',
              target: 'UTI-02',
            },
            { label: 'Assistência Farmácia', detail: 'Descontos em redes credenciadas', target: 'UTI-08' },
            { label: 'Assistência Funeral', detail: 'Suporte ao titular e aos dependentes', target: 'FUN-01' },
          ],
          'Continuar',
        ),
      ),
      screen(
        'UTI-02',
        'Escolher pessoa',
        'Quero uma consulta para minha filha.',
        'Para qual pessoa deseja acessar a telemedicina?',
        list(
          'Pessoa atendida',
          [
            { label: 'Ana Silva', detail: 'Titular', target: 'UTI-03' },
            { label: 'Maria Silva', detail: 'Dependente', target: 'UTI-03' },
          ],
          'Verificar disponibilidade',
        ),
      ),
      screen(
        'UTI-03',
        'Verificar disponibilidade',
        'Maria Silva',
        'Vou consultar o benefício, os limites e as carências aplicáveis para Maria.',
        {
          actions: [
            action('Ver acesso disponível', 'UTI-04'),
            action('Ver caso com carência', 'UTI-07'),
          ],
        },
      ),
      screen(
        'UTI-04',
        'Acesso disponível',
        'Posso acessar?',
        'O acesso à telemedicina está disponível para Maria neste cenário. O atendimento acontece no ambiente do prestador.',
        { actions: [action('Acessar demonstração', 'UTI-05'), action('Ver condições', 'DES-04')] },
      ),
      screen(
        'UTI-05',
        'Encaminhamento ao prestador',
        'Acessar telemedicina',
        'O acesso ao prestador foi disponibilizado. Você poderá acompanhar o atendimento nos canais indicados pelo serviço.',
        { actions: [action('Ver situação', 'UTI-06'), action('Preciso de ajuda', 'HUM-01')] },
      ),
      screen(
        'UTI-06',
        'Situação do encaminhamento',
        'A consulta foi realizada?',
        'O sistema confirma apenas que o acesso foi disponibilizado. Não há confirmação de consulta realizada neste exemplo.',
        { actions: [action('Acessar novamente', 'UTI-04'), action('Falar com alguém', 'HUM-01')] },
      ),
      screen(
        'UTI-07',
        'Benefício em carência',
        'Já posso usar?',
        'Este benefício ainda está em carência. A data de liberação deve ser consultada nas condições do contrato. Outros benefícios podem ter situações diferentes.',
        {
          ...variant(),
          actions: [
            action('Ver outros benefícios', 'UTI-01'),
            action('Pedir esclarecimento', 'HUM-01'),
          ],
        },
      ),
      screen(
        'UTI-08',
        'Utilizar farmácia',
        'Como uso o desconto na farmácia?',
        'A Assistência Farmácia oferece descontos em redes credenciadas. Posso orientar sobre a rede e a identificação necessária para utilizar o desconto.',
        { actions: [action('Ver identificação', 'UTI-09'), action('Pedir ajuda', 'HUM-01')] },
      ),
      screen(
        'UTI-09',
        'Identificação para benefício',
        'Ver identificação',
        'Seu acesso demonstrativo ao benefício está disponível. A identificação real e a rede serão definidas com o parceiro.',
        {
          mode: 'document',
          documents: ['Identificação do benefício'],
          actions: [action('Outros benefícios', 'UTI-01')],
        },
      ),
      screen(
        'UTI-10',
        'Prestador indisponível',
        'O acesso não abriu.',
        'O prestador está indisponível neste cenário. Você pode tentar novamente ou solicitar suporte.',
        {
          ...variant(),
          actions: [action('Tentar novamente', 'UTI-04'), action('Solicitar suporte', 'HUM-08')],
        },
      ),
    ],
  );

  journey(
    'FUN',
    'Assistência funeral',
    'Utilizar',
    'Acolhimento sóbrio e triagem curta, com acesso a uma pessoa em todas as etapas.',
    'Autosserviço primeiro, coletando o mínimo necessário ao acionamento.',
    'Dados mínimos, cobertura, localidade e disponibilidade do prestador dependem do contrato.',
    [
      screen(
        'FUN-01',
        'Acolhimento',
        'Preciso da assistência funeral.',
        'Posso ajudar a iniciar a solicitação. Você também pode pedir para falar com uma pessoa a qualquer momento.',
        {
          actions: [action('Iniciar solicitação', 'FUN-02'), action('Falar com alguém', 'HUM-01')],
        },
      ),
      screen(
        'FUN-02',
        'Dúvida ou acionamento',
        'Quero entender como funciona.',
        'Você precisa acionar o serviço agora ou quer conhecer as condições do benefício?',
        {
          actions: [
            action('Acionar serviço', 'FUN-03'),
            action('Ver condições', 'DES-04'),
            action('Falar com alguém', 'HUM-01'),
          ],
        },
      ),
      screen(
        'FUN-03',
        'Pessoa atendida',
        'Preciso acionar agora.',
        'Sinto muito pela sua perda. Para qual pessoa deseja solicitar a assistência?',
        list(
          'Pessoa atendida',
          [
            {
              label: 'Pessoa vinculada ao contrato',
              detail: 'Verificação de vínculo antes do acionamento',
              target: 'FUN-04',
            },
          ],
          'Continuar',
        ),
      ),
      screen(
        'FUN-04',
        'Localidade necessária',
        'Pessoa vinculada',
        'Precisamos da cidade e do estado para verificar o encaminhamento.',
        form(
          'Local do atendimento',
          [
            { name: 'funeralCity', label: 'Cidade', required: true },
            { name: 'funeralState', label: 'Estado', required: true },
          ],
          'Verificar disponibilidade',
          'FUN-05',
        ),
      ),
      screen(
        'FUN-05',
        'Verificar benefício',
        'Informei a localidade.',
        'Vou verificar o vínculo e as condições para encaminhar a solicitação ao prestador.',
        {
          actions: [action('Revisar solicitação', 'FUN-06'), action('Falar com alguém', 'HUM-01')],
        },
      ),
      screen(
        'FUN-06',
        'Revisão curta',
        'Quero continuar.',
        'Confira os dados essenciais antes do envio.',
        review(
          'Solicitar assistência',
          [
            {
              title: 'Dados do pedido',
              rows: [
                ['Pessoa', 'Pessoa selecionada'],
                ['Cidade', '{{funeralCity}}'],
                ['Estado', '{{funeralState}}'],
                ['Benefício', 'Assistência funeral'],
              ],
            },
          ],
          'Enviar solicitação',
          'FUN-07',
          { correction: 'FUN-04' },
        ),
      ),
      screen(
        'FUN-07',
        'Acionamento em envio',
        'Enviar solicitação',
        'Sua solicitação está sendo enviada ao prestador. Vou informar quando o recebimento for confirmado.',
        {
          actions: [action('Consultar resultado', 'FUN-08'), action('Falar com alguém', 'HUM-01')],
        },
      ),
      screen(
        'FUN-08',
        'Recebimento confirmado',
        'Consultar resultado',
        'O prestador confirmou o recebimento neste cenário.\nProtocolo: FUN-2026-0082.\nA próxima orientação e a previsão de contato dependem do prestador.',
        { actions: [action('Acompanhar pedido', 'SOL-04'), action('Falar com alguém', 'HUM-01')] },
      ),
      screen(
        'FUN-09',
        'Contato humano',
        'Preciso de uma pessoa.',
        'Vou encaminhar o contexto já coletado. Se houver um canal imediato do prestador, ele será disponibilizado aqui.',
        { actions: [action('Continuar atendimento', 'HUM-02')] },
      ),
      screen(
        'FUN-10',
        'Envio não confirmado',
        'O prestador recebeu?',
        'Ainda não há confirmação de recebimento. Para continuar, podemos consultar o pedido ou encaminhar você ao atendimento disponível.',
        {
          ...variant(),
          actions: [action('Consultar pedido', 'SOL-04'), action('Contato humano', 'HUM-01')],
        },
      ),
    ],
  );

  journey(
    'COB',
    'Cobrança e regularização',
    'Resolver',
    'Explicar valores, consultar parcelas e regularizar pelos meios elegíveis.',
    'Regularização no WhatsApp; confirmar pagamento e restabelecimento separadamente.',
    'Não generalizar regra de 90 dias nem cobrança retroativa das notas da reunião. Meios e valores são demonstrativos.',
    [
      screen(
        'COB-01',
        'Resumo financeiro',
        'Quero ver meus pagamentos.',
        '**Assistência Saúde Familiar**\nPróxima cobrança: R$ 39,90 em 10/11/2026.\nNeste cenário há 1 parcela pendente. Você pode consultar o detalhe antes de pagar.',
        {
          actions: [
            action('Ver pendência', 'COB-02'),
            action('Regularizar', 'COB-03'),
            action('Contestar cobrança', 'COB-10'),
          ],
        },
      ),
      screen(
        'COB-02',
        'Composição da cobrança',
        'Por que veio esse valor?',
        'Parcela de setembro: R$ 39,90.\nPlano Familiar: R$ 39,90.\nAdicional de dependentes: R$ 0,00 neste exemplo.\nSituação: em aberto.\nVencimento: 10/09/2026.',
        { actions: [action('Regularizar parcela', 'COB-03'), action('Não reconheço', 'COB-10')] },
      ),
      screen(
        'COB-03',
        'Escolher pendência',
        'Quero pagar a atrasada.',
        'Escolha a pendência que deseja consultar para regularização.',
        list(
          'Parcelas pendentes',
          [
            {
              label: 'Setembro de 2026',
              detail: 'Vencimento 10/09 · R$ 39,90 neste exemplo',
              target: 'COB-04',
            },
          ],
          'Ver pagamento',
        ),
      ),
      screen(
        'COB-04',
        'Meios disponíveis',
        'Setembro de 2026',
        'Neste cenário há um meio de regularização disponível. A disponibilidade real depende do produto e da processadora.',
        list(
          'Regularizar parcela',
          [
            {
              label: 'Pagamento seguro',
              detail: 'Autorização no ambiente da instituição',
              target: 'COB-05',
            },
          ],
          'Revisar',
        ),
      ),
      screen(
        'COB-05',
        'Revisar regularização',
        'Quero revisar.',
        'Confira o valor atualizado e os efeitos antes de pagar.',
        review(
          'Regularizar pendência',
          [
            {
              title: 'Parcela',
              rows: [
                ['Competência', 'Setembro de 2026'],
                ['Valor atualizado', 'R$ 39,90'],
                ['Encargos neste exemplo', 'R$ 0,00'],
                ['Efeito no contrato', 'Consultar após baixa confirmada'],
              ],
            },
          ],
          'Iniciar pagamento',
          'COB-06',
        ),
      ),
      screen(
        'COB-06',
        'Iniciar pagamento',
        'Iniciar pagamento',
        'A etapa de pagamento foi iniciada. Vou consultar o resultado sem criar outra cobrança.',
        { actions: [action('Consultar pagamento', 'COB-07')] },
      ),
      screen(
        'COB-07',
        'Pagamento em processamento',
        'Já paguei.',
        'O pagamento ainda está em processamento. A parcela só será apresentada como quitada após a confirmação.',
        {
          actions: [
            action('Consultar atualização', 'COB-08'),
            action('Acompanhar pedido', 'SOL-04'),
          ],
        },
      ),
      screen(
        'COB-08',
        'Pagamento confirmado',
        'Consultar atualização',
        'Pagamento confirmado.\nParcela de setembro: quitada.\nProtocolo: PAG-2026-0741.\nA situação dos benefícios deve ser consultada separadamente.',
        { actions: [action('Ver comprovante', 'CON-07'), action('Ver contrato', 'CON-02')] },
      ),
      screen(
        'COB-09',
        'Pagamento não concluído',
        'O pagamento falhou.',
        'A tentativa não foi concluída. Podemos consultar os meios disponíveis para tentar novamente.',
        { ...variant(), actions: [action('Ver meios', 'COB-04'), action('Pedir ajuda', 'HUM-01')] },
      ),
      screen(
        'COB-10',
        'Contestar cobrança',
        'Não reconheço essa cobrança.',
        'Vou registrar sua divergência vinculada à parcela. Conte o que você não reconhece.',
        form(
          'Contestar cobrança',
          [{ name: 'dispute', label: 'Descreva a divergência', type: 'textarea', required: true }],
          'Registrar contestação',
          'COB-11',
        ),
      ),
      screen(
        'COB-11',
        'Contestação registrada',
        'Registrar contestação',
        'Contestação registrada para análise.\nProtocolo: COB-2026-0064.\nO registro não confirma alteração ou suspensão da cobrança.',
        { actions: [action('Acompanhar análise', 'SOL-04')] },
      ),
      screen(
        'COB-12',
        'Pagamento já reconhecido',
        'Quero pagar setembro.',
        'A parcela já está quitada. Não será criada outra tentativa. Você pode consultar o comprovante.',
        { ...variant(), actions: [action('Ver comprovante', 'CON-07')] },
      ),
      screen(
        'COB-13',
        'Contrato encerrado',
        'Quero pagar uma pendência antiga.',
        'O contrato está encerrado. Precisamos verificar se essa parcela pode ser cobrada e quais meios são permitidos.',
        { ...variant(), actions: [action('Solicitar análise', 'HUM-08')] },
      ),
      screen(
        'COB-14',
        'Valor atualizado',
        'Quero confirmar o pagamento.',
        'O valor disponível mudou desde a última consulta. Revise a parcela atualizada antes de pagar.',
        { ...variant(), actions: [action('Revisar valor', 'COB-05')] },
      ),
    ],
  );

  journey(
    'CAN',
    'Cancelamento e restituição',
    'Encerrar',
    'Uma alternativa opcional, efeitos claros e confirmação da primeira data permitida pelo produto.',
    'Uma oferta, sem insistência. Motivo opcional. Pedido explícito sem ofertas é respeitado.',
    'Data, vigência, restituição e cobrança precisam ser validadas por produto. Não adotar automaticamente os 20 dias do legado.',
    [
      screen(
        'CAN-01',
        'Pedido de cancelamento',
        'Quero cancelar minha assistência.',
        'Posso ajudar. Vou identificar o contrato e consultar os efeitos do cancelamento.',
        { actions: [action('Continuar', 'CAN-13'), action('Falar com alguém', 'HUM-01')] },
      ),
      screen(
        'CAN-02',
        'Esclarecer alcance',
        'Quero cancelar a Maria.',
        'Você quer excluir a dependente Maria ou encerrar toda a assistência?',
        {
          actions: [
            action('Excluir dependente', 'EXC-01'),
            action('Cancelar assistência', 'CAN-05'),
          ],
        },
      ),
      screen(
        'CAN-03',
        'Uma oferta opcional',
        'Quero cancelar porque está caro.',
        'Há uma opção de menor valor elegível neste cenário: Individual, R$ 29,90/mês. Você pode comparar os efeitos ou seguir com o cancelamento.',
        { actions: [action('Ver alternativa', 'PLA-03'), action('Seguir cancelamento', 'CAN-05')] },
      ),
      screen(
        'CAN-04',
        'Recusa ou sem ofertas',
        'Não quero ofertas. Quero cancelar.',
        'Vamos seguir diretamente para a revisão dos efeitos do cancelamento.',
        { actions: [action('Revisar cancelamento', 'CAN-05')] },
      ),
      screen(
        'CAN-05',
        'Revisar efeitos',
        'Quero continuar cancelando.',
        'Confira a primeira data permitida e os efeitos consultados.',
        review(
          'Cancelar assistência',
          [
            {
              title: 'Encerramento',
              rows: [
                ['Contrato', 'Assistência Saúde Familiar'],
                ['Data efetiva neste cenário', '10/10/2026'],
                ['Acesso aos benefícios', 'Até a data efetiva consultada'],
                ['Pessoas afetadas', 'Titular e dependentes'],
              ],
            },
            {
              title: 'Efeitos financeiros',
              rows: [
                ['Próximas cobranças', 'Conforme cálculo do sistema'],
                ['Restituição neste cenário', 'Sem saldo a restituir'],
                ['Documento', 'Termo após confirmação'],
              ],
            },
          ],
          'Confirmar cancelamento',
          'CAN-07',
          { secondaryLabel: 'Manter contrato', correction: 'CON-02' },
        ),
      ),
      screen(
        'CAN-06',
        'Confirmação explícita',
        'Quero confirmar.',
        'Sua confirmação deve corresponder às condições de encerramento apresentadas.',
        { actions: [action('Revisar e confirmar', 'CAN-05'), action('Manter contrato', 'CON-02')] },
      ),
      screen(
        'CAN-07',
        'Cancelamento em processamento',
        'Confirmar cancelamento',
        'Recebi sua confirmação. Estou verificando a execução do cancelamento.',
        { actions: [action('Consultar resultado', 'CAN-08')] },
      ),
      screen(
        'CAN-08',
        'Cancelamento concluído',
        'Consultar resultado',
        '**Contrato encerrado**\nData efetiva neste cenário: 10/10/2026.\nProtocolo: CAN-2026-0110.\nO termo de cancelamento está disponível.',
        {
          mode: 'document',
          documents: ['Termo de cancelamento'],
          actions: [action('Ver solicitação', 'SOL-06')],
        },
      ),
      screen(
        'CAN-09',
        'Cancelamento agendado',
        'Meu cancelamento aconteceu?',
        'O cancelamento está agendado para a primeira data permitida neste cenário. Até lá, consulte as condições de utilização e cobrança apresentadas na revisão.',
        {
          ...variant(),
          actions: [action('Ver agendamento', 'SOL-05'), action('Ver contrato', 'CON-05')],
        },
      ),
      screen(
        'CAN-10',
        'Restituição em acompanhamento',
        'Tenho valor para receber?',
        'Há uma restituição em acompanhamento neste cenário. O valor, destino e prazo serão os retornados pelo sistema financeiro, sem estimativas do assistente.',
        {
          ...variant(),
          actions: [
            action('Acompanhar restituição', 'SOL-04'),
            action('Pedir esclarecimento', 'HUM-01'),
          ],
        },
      ),
      screen(
        'CAN-11',
        'Sem oferta elegível',
        'Quero cancelar.',
        'Não há alternativa elegível para apresentar. Vamos revisar diretamente os efeitos do cancelamento.',
        { ...variant(), actions: [action('Revisar efeitos', 'CAN-05')] },
      ),
      screen(
        'CAN-12',
        'Data ainda indisponível',
        'Quando termina?',
        'Não foi possível determinar a data e os efeitos agora. A solicitação precisa de resolução antes da confirmação.',
        { ...variant(), actions: [action('Solicitar atendimento', 'HUM-08')] },
      ),
      screen(
        'CAN-13',
        'Motivo do cancelamento (opcional)',
        'Quero cancelar minha assistência.',
        'Se quiser, conte por que está cancelando. Sua resposta é opcional e não impede o cancelamento.',
        { ...list('Motivo (opcional)', [
          { label: 'O valor não compensa', target: 'CAN-14' },
          { label: 'Não utilizei o benefício', target: 'CAN-14' },
          { label: 'Contratei outro serviço', target: 'CAN-14' },
          { label: 'Desisti da contratação', target: 'CAN-14' },
          { label: 'Outro motivo', target: 'CAN-14' },
        ], 'Continuar'), actions: [action('Prefiro não informar', 'CAN-05')], rule: 'Motivo opcional; não condicionar a continuidade do cancelamento à resposta.' },
      ),
      screen('CAN-14', 'Motivo registrado', '{{cancelReason}}', 'Obrigado por compartilhar. Vamos revisar os efeitos do cancelamento antes de qualquer confirmação.', { actions: [action('Revisar efeitos', 'CAN-05')] }),
    ],
  );

  journey(
    'FIM',
    'Encerrar conversa',
    'Encerrar',
    'Finaliza o atendimento atual sem cancelar contrato ou apagar solicitações.',
    'Confirmação explícita e distinção clara entre conversa e operação de produto.',
    'Encerrar o chat não altera contrato, benefícios, pagamentos ou solicitações em andamento.',
    [
      screen('FIM-01', 'Confirmar encerramento da conversa', 'Quero encerrar o atendimento.', 'Você quer finalizar esta conversa? Isso não cancela sua assistência nem apaga pedidos em andamento.', { actions: [action('Sim, encerrar conversa', 'FIM-02'), action('Continuar atendimento', 'NAV-01')] }),
      screen('FIM-02', 'Atendimento encerrado', 'Sim, encerrar conversa.', 'Atendimento encerrado. Sua assistência e eventuais solicitações não foram alteradas. Quando precisar, é só iniciar uma nova conversa.', { actions: [action('Começar nova conversa', 'ENT-02')] }),
    ],
  );

  journey(
    'REN',
    'Renovação e continuidade',
    'Continuar',
    'Comparação das condições atuais e futuras antes do aceite de um novo período.',
    'Novas condições exigem confirmação explícita. Ausência de resposta não é aceite.',
    'Aplicável a produtos com prazo determinado; recorrência contínua não é necessariamente renovação.',
    [
      screen(
        'REN-01',
        'Aviso de fim de vigência',
        'Recebi um aviso de renovação.',
        'Seu contrato termina em 10/11/2026 neste cenário. Há uma opção de continuidade com novas condições. Você pode revisar antes de decidir.',
        { actions: [action('Revisar condições', 'REN-02'), action('Tirar uma dúvida', 'HUM-01')] },
      ),
      screen(
        'REN-02',
        'Comparar condições',
        'O que vai mudar?',
        'Vamos comparar preço, benefícios, participantes, carências e vigência.',
        review(
          'Condições de continuidade',
          [
            {
              title: 'Atual e próximo período',
              rows: [
                ['Valor atual', 'R$ 39,90/mês'],
                ['Novo valor neste exemplo', 'R$ 42,90/mês'],
                ['Participantes', 'Mantidos, sujeitos à validação'],
                ['Benefícios', 'Conforme documento atualizado'],
                ['Novo início', '11/11/2026'],
              ],
            },
          ],
          'Continuar revisão',
          'REN-03',
        ),
      ),
      screen(
        'REN-03',
        'Revisão e documentos',
        'Quero continuar.',
        'Confira as condições completas. Sua escolha precisa ser explícita.',
        review(
          'Renovar contrato',
          [
            {
              title: 'Nova vigência',
              rows: [
                ['Produto', 'Assistência Saúde'],
                ['Novo valor', 'R$ 42,90/mês'],
                ['Início', '11/11/2026'],
                ['Primeira cobrança', 'Data informada pelo sistema'],
              ],
            },
          ],
          'Confirmar continuidade',
          'REN-04',
          {
            documents: ['Condições de continuidade'],
            consent: 'Aceito as condições apresentadas para o novo período.',
            correction: 'REN-02',
          },
        ),
      ),
      screen(
        'REN-04',
        'Confirmação em processamento',
        'Confirmar continuidade',
        'Recebi seu aceite. Estou verificando a conclusão da continuidade.',
        { actions: [action('Consultar resultado', 'REN-05')] },
      ),
      screen(
        'REN-05',
        'Continuidade confirmada',
        'Consultar resultado',
        'A continuidade foi confirmada para o novo período.\nProtocolo: REN-2026-0025.\nOs documentos atualizados estão disponíveis.',
        { actions: [action('Ver documentos', 'CON-07'), action('Ver contrato', 'CON-02')] },
      ),
      screen(
        'REN-06',
        'Contrato encerrado',
        'Não quero continuar.',
        'Sua decisão foi registrada. O contrato segue até a data final informada e será tratado conforme suas condições. Não houve aceite do novo período.',
        { ...variant(), actions: [action('Ver vigência', 'CON-06')] },
      ),
      screen(
        'REN-07',
        'Decisão adiada',
        'Vou decidir depois.',
        'Você pode retomar enquanto a opção estiver disponível. A falta de resposta não será registrada como aceite.',
        { ...variant(), actions: [action('Minhas solicitações', 'SOL-02')] },
      ),
      screen(
        'REN-08',
        'Oferta expirada',
        'Quero renovar.',
        'A opção anterior expirou. Precisamos consultar as condições disponíveis agora.',
        { ...variant(), actions: [action('Consultar opção atual', 'REN-02')] },
      ),
      screen(
        'REN-09',
        'Condições mudaram',
        'Confirmar continuidade',
        'As condições mudaram desde a última revisão. Você precisa conferir novamente antes de aceitar.',
        { ...variant(), actions: [action('Revisar condições', 'REN-02')] },
      ),
    ],
  );

  journey(
    'SOL',
    'Minhas solicitações',
    'Acompanhar',
    'Escolha do contrato antes da lista, com ações sobre a situação atual do pedido.',
    'Selecionar contrato primeiro; entrada por protocolo ou notificação abre o pedido correspondente.',
    'Histórico e disponibilidade de documentos dependem da política operacional.',
    [
      screen(
        'SOL-01',
        'Contrato antes dos pedidos',
        'Quero acompanhar minhas solicitações.',
        'Para qual contrato deseja consultar os pedidos?',
        list(
          'Escolher contrato',
          contracts.map((c) => ({ ...c, target: 'SOL-02' })),
          'Ver solicitações',
        ),
      ),
      screen(
        'SOL-02',
        'Lista por contrato',
        'Assistência Saúde Familiar',
        'Estas são as solicitações do contrato selecionado.',
        list(
          'Minhas solicitações',
          [
            {
              label: 'Inclusão de dependente',
              detail: 'Aguardando sua confirmação',
              target: 'SOL-03',
            },
            { label: 'Troca de plano', detail: 'Agendada para o próximo ciclo', target: 'SOL-05' },
            { label: 'Correção cadastral', detail: 'Em análise', target: 'SOL-04' },
            { label: 'Contratação', detail: 'Concluída', target: 'SOL-06' },
          ],
          'Abrir pedido',
        ),
      ),
      screen(
        'SOL-03',
        'Ação do cliente necessária',
        'Inclusão de dependente',
        '**Inclusão de dependente**\nSituação: aguardando sua confirmação.\nOs dados foram salvos, mas a inclusão ainda não foi enviada. Revise as condições atuais para continuar.',
        { actions: [action('Revisar inclusão', 'DEP-06'), action('Ver outros pedidos', 'SOL-02')] },
      ),
      screen(
        'SOL-04',
        'Em processamento',
        'Quero acompanhar o pedido.',
        '**Solicitação em processamento**\nProtocolo: CAD-2026-0041 neste cenário.\nÚltima atualização: 10/10/2026.\nA previsão será exibida quando confirmada pela operação.',
        {
          actions: [
            action('Consultar atualização', 'SOL-06'),
            action('Pedir ajuda', 'HUM-01'),
            action('Trocar contrato', 'SOL-01'),
          ],
        },
      ),
      screen(
        'SOL-05',
        'Agendamento futuro',
        'Troca de plano',
        '**Troca de plano agendada**\nPlano atual: Familiar.\nPróximo plano: Individual.\nData efetiva: 10/11/2026.\nProtocolo: PLA-2026-0172.',
        { actions: [action('Ver contrato', 'CON-11'), action('Ver outros pedidos', 'SOL-02')] },
      ),
      screen(
        'SOL-06',
        'Pedido concluído',
        'Quero ver o resultado.',
        '**Solicitação concluída neste cenário**\nO resultado e os documentos correspondentes estão disponíveis. Consulte o detalhe do pedido para conferir seu efeito no contrato.',
        { actions: [action('Ver documentos', 'CON-07'), action('Ver histórico', 'SOL-09')] },
      ),
      screen(
        'SOL-07',
        'Pedido não concluído',
        'Por que meu pedido não terminou?',
        'A solicitação não foi concluída. O motivo retornado pela operação será apresentado, com opções para corrigir ou solicitar ajuda.',
        {
          ...variant(),
          actions: [action('Corrigir pendência', 'DEP-14'), action('Pedir ajuda', 'HUM-01')],
        },
      ),
      screen(
        'SOL-08',
        'Nenhuma solicitação',
        'Meus pedidos',
        'Não há solicitações disponíveis para este contrato. Você pode consultar o contrato ou iniciar um novo pedido.',
        { ...variant(), actions: [action('Ver contrato', 'CON-02'), action('Menu', 'NAV-01')] },
      ),
      screen(
        'SOL-09',
        'Histórico de pedidos',
        'Quero ver pedidos anteriores.',
        'Selecione um pedido anterior deste contrato.',
        list(
          'Histórico',
          [
            { label: 'Contratação', detail: 'Concluída · 10/10/2026', target: 'ADE-09' },
            { label: 'Correção de dependente', detail: 'Concluída · 10/10/2026', target: 'DEP-23' },
          ],
          'Ver resultado',
        ),
      ),
      screen(
        'SOL-10',
        'Entrada por protocolo',
        'Protocolo DEP-2026-0318',
        'Vou consultar o pedido correspondente após verificar a identidade necessária.',
        { actions: [action('Ver pedido', 'DEP-09'), action('Verificação necessária', 'IDE-01')] },
      ),
    ],
  );

  journey(
    'HUM',
    'Atendimento humano',
    'Resolver',
    'Transferência com contexto e pedido de retorno quando não houver disponibilidade.',
    'Pessoa acessível em qualquer etapa. Retorno registrado no WhatsApp.',
    'Fila, horários, previsão, canal urgente e regras do retorno precisam de validação operacional.',
    [
      screen(
        'HUM-01',
        'Pedido de atendimento',
        'Quero falar com uma pessoa.',
        'Vou verificar a disponibilidade da equipe. O contexto da conversa será levado para o atendimento.',
        { actions: [action('Continuar', 'HUM-02')] },
      ),
      screen(
        'HUM-02',
        'Contexto preparado',
        'Pode continuar.',
        'A equipe receberá o motivo do contato e os dados já coletados. Você não precisa repetir seu pedido do início.',
        {
          actions: [
            action('Ver fila disponível', 'HUM-03'),
            action('Ver fora do horário', 'HUM-05'),
          ],
        },
      ),
      screen(
        'HUM-03',
        'Aguardando atendimento',
        'Estou aguardando.',
        'Você está aguardando atendimento. A previsão aparece somente quando disponível. A solicitação anterior permanece preservada.',
        { actions: [action('Simular início', 'HUM-04'), action('Ver meu pedido', 'SOL-04')] },
      ),
      screen(
        'HUM-04',
        'Pessoa assume',
        'Olá.',
        'Olá, Ana. Sou Carla, da equipe de atendimento. Recebi o contexto da sua solicitação de inclusão. Como posso continuar ajudando?',
        { agent: 'Carla · atendimento', actions: [action('Simular conclusão', 'HUM-07')] },
      ),
      screen(
        'HUM-05',
        'Fora do horário',
        'Preciso de atendimento.',
        'Nossa equipe está indisponível neste momento. Posso registrar seu pedido para continuar por aqui.',
        {
          ...variant(),
          actions: [
            action('Solicitar retorno', 'HUM-08'),
            action('Continuar autosserviço', 'NAV-01'),
          ],
        },
      ),
      screen(
        'HUM-06',
        'Transferência indisponível',
        'Não consegui atendimento.',
        'Não foi possível iniciar a transferência agora. Podemos registrar um retorno com o contexto da conversa.',
        { ...variant(), actions: [action('Registrar retorno', 'HUM-08')] },
      ),
      screen(
        'HUM-07',
        'Atendimento concluído',
        'Obrigada.',
        'Seu atendimento foi concluído neste cenário.\nProtocolo: HUM-2026-0042.\nOs próximos passos combinados permanecem disponíveis na solicitação.',
        {
          agent: 'Carla · atendimento',
          actions: [action('Ver solicitação', 'SOL-06'), action('Menu', 'NAV-01')],
        },
      ),
      screen(
        'HUM-08',
        'Retorno registrado',
        'Solicitar retorno',
        'Pedido de retorno registrado.\nProtocolo: HUM-2026-0043.\nAssunto: continuidade da solicitação.\nA previsão será informada quando houver disponibilidade confiável.',
        {
          actions: [
            action('Acompanhar retorno', 'HUM-09'),
            action('Continuar autosserviço', 'NAV-01'),
          ],
        },
      ),
      screen(
        'HUM-09',
        'Retorno aguardando',
        'Quando vão falar comigo?',
        'Seu pedido está aguardando atendimento. O prazo não será estimado sem informação confirmada pela operação.',
        { actions: [action('Ver contexto', 'SOL-04'), action('Não preciso mais', 'HUM-12')] },
      ),
      screen(
        'HUM-10',
        'Equipe inicia retorno',
        'Recebi seu contato.',
        'Olá, Ana. Sou Carla. Estou retomando o pedido HUM-2026-0043 e já tenho o contexto da conversa.',
        { agent: 'Carla · atendimento', actions: [action('Continuar atendimento', 'HUM-04')] },
      ),
      screen(
        'HUM-11',
        'Cliente não responde',
        'Voltei agora.',
        'O atendimento tentou continuar e está com a situação registrada. Vou consultar como retomar conforme a política operacional.',
        { ...variant(), actions: [action('Retomar atendimento', 'HUM-02')] },
      ),
      screen(
        'HUM-12',
        'Pedido resolvido antes do retorno',
        'Não preciso mais do retorno.',
        'Vou registrar que você não precisa mais deste retorno. Isso não cancela contratos ou outras solicitações.',
        { actions: [action('Confirmar encerramento do retorno', 'HUM-07')] },
      ),
    ],
  );

  journey(
    'RET',
    'Pausa e retomada',
    'Acompanhar',
    'Recuperar progresso com condições atualizadas e situação real das operações.',
    'Oferecer retomar ou começar outro assunto. Confirmação antiga não autoriza uma nova operação.',
    'Prazo de retenção de rascunhos e expiração ainda precisam ser definidos.',
    [
      screen(
        'RET-01',
        'Preenchimento incompleto',
        'Oi, voltei.',
        'Há uma solicitação incompleta. Quer continuar ou falar sobre outro assunto?',
        { actions: [action('Continuar solicitação', 'RET-02'), action('Outro assunto', 'NAV-01')] },
      ),
      screen(
        'RET-02',
        'Confirmar após revalidação',
        'Quero continuar.',
        'Você estava incluindo um dependente. Os dados foram salvos, mas a inclusão não foi confirmada. Vamos consultar as condições atuais.',
        { actions: [action('Revisar e continuar', 'DEP-06'), action('Corrigir dados', 'DEP-14')] },
      ),
      screen(
        'RET-03',
        'Operação já em processamento',
        'Quero tentar de novo.',
        'Há uma operação em processamento. Vou consultar o resultado antes de permitir outra tentativa.',
        { ...variant(), actions: [action('Consultar resultado', 'SOL-04')] },
      ),
      screen(
        'RET-04',
        'Concluída durante ausência',
        'Quero retomar.',
        'A solicitação foi concluída enquanto você estava ausente. Você pode consultar o resultado e o protocolo.',
        { actions: [action('Ver resultado', 'SOL-06')] },
      ),
      screen(
        'RET-05',
        'Condições alteradas',
        'Quero confirmar o que vi antes.',
        'As condições mudaram desde sua última revisão. Confira a versão atual antes de confirmar.',
        { ...variant(), actions: [action('Revisar condições', 'ADE-06')] },
      ),
      screen(
        'RET-06',
        'Solicitação expirada',
        'Quero continuar o pedido antigo.',
        'Este rascunho expirou. Vamos informar quais dados podem ser recuperados e consultar novamente as condições.',
        { ...variant(), actions: [action('Recomeçar com contexto', 'ADE-01')] },
      ),
      screen(
        'RET-07',
        'Várias solicitações pendentes',
        'Quero continuar.',
        'Há mais de uma solicitação pendente. Escolha o contrato para consultar seus pedidos.',
        { actions: [action('Escolher contrato', 'SOL-01')] },
      ),
      screen(
        'RET-08',
        'Outro assunto ou desistência',
        'Quero falar de outra coisa.',
        'Podemos começar outro assunto. A situação da solicitação anterior continua registrada; nenhuma alteração do contrato foi realizada por esta escolha.',
        { actions: [action('Ver opções', 'NAV-01')] },
      ),
    ],
  );

  journey(
    'NOT',
    'Avisos de serviço',
    'Acompanhar',
    'Atualizações úteis, sem exposição desnecessária e com consulta da situação atual.',
    'Somente serviço e acompanhamento. Sem ofertas comerciais nesta proposta.',
    'Envio, autorização, templates, janela do canal e frequência dependem do provedor e da política de comunicação.',
    [
      screen(
        'NOT-01',
        'Documento disponível',
        '',
        'Um documento do seu contrato está disponível. Você pode acessar por aqui após a verificação necessária.',
        { actions: [action('Ver documento', 'CON-07')] },
      ),
      screen(
        'NOT-02',
        'Resultado de solicitação',
        '',
        'Há uma atualização da sua solicitação. Consulte a situação atual para ver o resultado.',
        { actions: [action('Consultar pedido', 'SOL-06')] },
      ),
      screen(
        'NOT-03',
        'Troca de plano efetivada',
        '',
        'A troca de plano que você solicitou foi efetivada. Consulte as condições atualizadas.',
        { actions: [action('Ver contrato', 'PLA-11')] },
      ),
      screen(
        'NOT-04',
        'Benefício disponível',
        '',
        'Há uma atualização na disponibilidade de um benefício do seu contrato. Você pode conferir como utilizar.',
        { actions: [action('Consultar benefício', 'UTI-03')] },
      ),
      screen(
        'NOT-05',
        'Pendência financeira',
        '',
        'Há uma atualização financeira do seu contrato. Consulte a situação atual antes de iniciar um pagamento.',
        { actions: [action('Consultar cobrança', 'COB-01')] },
      ),
      screen(
        'NOT-06',
        'Fim de vigência próximo',
        '',
        'O período do seu contrato está próximo do término. Você pode consultar as opções de continuidade.',
        { actions: [action('Ver continuidade', 'REN-01')] },
      ),
      screen(
        'NOT-07',
        'Cancelamento efetivado',
        '',
        'O cancelamento solicitado foi efetivado. O comprovante está disponível para consulta.',
        { actions: [action('Ver comprovante', 'CAN-08')] },
      ),
      screen(
        'NOT-08',
        'Atualização de restituição',
        '',
        'Há uma atualização na restituição vinculada à sua solicitação. Consulte a situação por aqui.',
        { actions: [action('Consultar restituição', 'CAN-10')] },
      ),
      screen(
        'NOT-09',
        'Retorno do atendimento',
        '',
        'A equipe está retomando o atendimento solicitado. Podemos continuar por aqui.',
        { actions: [action('Continuar atendimento', 'HUM-10')] },
      ),
      screen(
        'NOT-10',
        'Notificação antiga resolvida',
        'Abri um aviso antigo de cobrança.',
        'A situação foi atualizada desde aquele aviso. A parcela já está quitada; não há necessidade de novo pagamento.',
        { ...variant(), actions: [action('Ver comprovante', 'CON-07')] },
      ),
    ],
  );

  journey(
    'PRE',
    'Preferências de comunicação',
    'Acompanhar',
    'Proposta de escolha de avisos opcionais e tratamento separado das comunicações necessárias.',
    'Serviço e acompanhamento; preferências opcionais separadas do aceite contratual.',
    'Categorias obrigatórias, canais alternativos e alcance da desativação ainda precisam de validação.',
    [
      screen(
        'PRE-01',
        'Consultar preferências',
        'Quero ajustar os avisos.',
        'Você pode ajustar avisos opcionais. Comunicações necessárias ao contrato terão os canais e condições informados pela operação.',
        { actions: [action('Ajustar avisos', 'PRE-02')] },
      ),
      screen(
        'PRE-02',
        'Escolher avisos opcionais',
        'Quero escolher.',
        'Selecione os avisos opcionais que deseja receber neste exemplo.',
        form(
          'Preferências de avisos',
          [
            {
              name: 'optionalDocs',
              label: 'Avisos opcionais sobre documentos',
              type: 'checkbox',
              checked: true,
            },
            {
              name: 'optionalBenefits',
              label: 'Avisos opcionais de benefícios disponíveis',
              type: 'checkbox',
              checked: false,
            },
          ],
          'Salvar preferências',
          'PRE-03',
          { note: 'Classificação dos avisos ainda sujeita à validação do negócio.' },
        ),
      ),
      screen(
        'PRE-03',
        'Preferências salvas',
        'Salvar preferências',
        'Suas escolhas opcionais foram salvas na demonstração. Comunicações necessárias seguem a política e os canais aplicáveis.',
        { actions: [action('Ver preferências', 'PRE-02'), action('Menu', 'NAV-01')] },
      ),
    ],
  );

  journey(
    'LEG',
    'Referência legada',
    'Referência',
    '34 estados documentados no legado, reconstruídos para comparação com a proposta conversacional.',
    'Referência histórica. Inconsistências documentais aparecem no painel de revisão e não viram regra futura.',
    'Reconstrução documental, não cópia pixel a pixel dos frames Figma. IDs 143 e 150 não constam no inventário fornecido.',
    [
      screen(
        'LEG-137',
        '137 · Boas-vindas e CPF',
        'Oi',
        'Olá, boas-vindas ao WhatsApp de Assistência Saúde Digio 💙\nAqui você pode consultar informações sobre sua assistência e gerenciar dependentes.\nPara começar, qual é o número do seu CPF?',
      ),
      screen('LEG-138', '138 · Envio do CPF', '000.000.000-00', 'CPF recebido para consulta.'),
      screen(
        'LEG-139',
        '139 · Solicitar nascimento',
        'CPF informado',
        'Qual é sua data de nascimento?',
      ),
      screen('LEG-140', '140 · Envio do nascimento', '01/09/2002', 'Data de nascimento recebida.'),
      screen(
        'LEG-141',
        '141 · Compartilhar contato',
        'Data informada',
        'Compartilhe seu número de celular para prosseguirmos com a jornada.',
        { actions: [action('Compartilhar contato', 'LEG-142')] },
      ),
      screen(
        'LEG-142',
        '142 · Titular identificado',
        'Contato compartilhado',
        '**Ana Maria**\nTitular identificado · Digio.\nComo deseja prosseguir?',
        { actions: [action('Conversar', 'LEG-144')] },
      ),
      screen('LEG-144', '144 · Abrir menu', 'Conversar', 'Como deseja prosseguir?', {
        actions: [action('Selecione uma opção', 'LEG-145')],
      }),
      screen(
        'LEG-145',
        '145 · Menu de opções',
        'Selecione uma opção',
        'Selecione o serviço que deseja gerenciar.',
        list(
          'Menu principal legado',
          [
            { label: 'Tirar dúvidas', target: 'LEG-146' },
            { label: 'Gerenciar dependentes', target: 'LEG-151' },
            { label: 'Alterar plano — em breve', disabled: true },
            { label: 'Cancelar assistência', target: 'LEG-166' },
          ],
          'Selecionar opção',
        ),
      ),
      screen('LEG-146', '146 · Tirar dúvidas', 'Tirar dúvidas', 'Vamos consultar um tópico.'),
      screen('LEG-147', '147 · Solicitar tópico', 'Tirar dúvidas', 'O que deseja consultar?', {
        actions: [action('Selecionar tópico', 'LEG-148')],
      }),
      screen(
        'LEG-148',
        '148 · Lista de tópicos',
        'Selecionar tópico',
        'Escolha o assunto que deseja entender.',
        list(
          'Tópicos de dúvidas',
          ['Informações gerais', 'Utilização da assistência', 'Coberturas', 'Carências'].map(
            (label) => ({ label, target: 'LEG-149' }),
          ),
          'Ver detalhes',
        ),
      ),
      screen(
        'LEG-149',
        '149 · Coberturas',
        'Coberturas',
        'Você tem acesso a Telemedicina, Assistência Funeral com suporte ao titular e aos dependentes e Assistência Farmácia com descontos em redes credenciadas, conforme seu plano.\nEste serviço não é plano de saúde e não cobre procedimentos hospitalares.',
        { actions: [action('Menu', 'LEG-144'), action('Encerrar', 'ENT-02')] },
      ),
      screen(
        'LEG-151',
        '151 · Gerenciar dependentes',
        'Gerenciar dependentes',
        'Vamos consultar as ações disponíveis.',
      ),
      screen(
        'LEG-152',
        '152 · Ações de dependentes',
        'Gerenciar dependentes',
        'O que deseja fazer?',
        {
          actions: [
            action('Consultar', 'LEG-153'),
            action('Incluir', 'LEG-155'),
            action('Excluir', 'LEG-159'),
          ],
        },
      ),
      screen(
        'LEG-153',
        '153 · Consultar dependentes',
        'Consultar dependentes',
        'Consultando as pessoas vinculadas.',
      ),
      screen(
        'LEG-154',
        '154 · Lista de dependentes',
        'Consultar',
        'Maria José da Silva · filha.\nCarlos Alberto Menezes · cônjuge.\nVocê possui 2 vagas disponíveis neste exemplo do legado.',
        { actions: [action('Menu', 'LEG-144'), action('Encerrar', 'ENT-02')] },
      ),
      screen(
        'LEG-155',
        '155 · Iniciar inclusão',
        'Incluir dependentes',
        'Vamos receber os dados da pessoa.',
      ),
      screen(
        'LEG-156',
        '156 · Solicitar cinco dados',
        'Incluir',
        'Informe nome completo, CPF, celular, data de nascimento e sexo biológico do dependente.',
      ),
      screen(
        'LEG-157',
        '157 · Dados em bloco',
        'Maria José Silva\n000.000.000-00\n(11) 90000-0000\n12/03/2004\nFeminino',
        'Dados recebidos para validação.',
      ),
      screen(
        'LEG-158',
        '158 · Inclusão confirmada',
        'Dados enviados',
        'O dependente atende aos critérios e foi incluído. Você pode cadastrar até 4 pessoas no pacote, segundo o texto legado.',
        {
          actions: [
            action('Incluir outro', 'LEG-155'),
            action('Menu', 'LEG-144'),
            action('Encerrar', 'ENT-02'),
          ],
        },
      ),
      screen(
        'LEG-159',
        '159 · Iniciar exclusão',
        'Excluir dependentes',
        'Vamos selecionar a pessoa.',
      ),
      screen(
        'LEG-160',
        '160 · Solicitar seleção',
        'Excluir',
        'Selecione qual dependente deseja excluir.',
        { actions: [action('Selecionar dependente', 'LEG-161')] },
      ),
      screen(
        'LEG-161',
        '161 · Lista de exclusão',
        'Selecionar dependente',
        'Escolha a pessoa que será desvinculada.',
        list(
          'Excluir dependente',
          [
            'Maria José da Silva',
            'João da Silva',
            'Carlos Alberto Menezes',
            'Lourenço de Assis',
          ].map((label) => ({ label, target: 'LEG-162' })),
          'Continuar',
        ),
      ),
      screen(
        'LEG-162',
        '162 · Pessoa escolhida',
        'Maria José da Silva',
        'Pessoa selecionada para exclusão.',
      ),
      screen(
        'LEG-163',
        '163 · Alerta e confirmação',
        'Maria José da Silva',
        'Deseja excluir Maria José da Silva? O legado informa encerramento imediato do acesso aos benefícios.',
        { actions: [action('Excluir', 'LEG-164'), action('Manter', 'LEG-152')] },
      ),
      screen(
        'LEG-164',
        '164 · Confirmar exclusão',
        'Excluir dependente',
        'Processando a solicitação.',
      ),
      screen(
        'LEG-165',
        '165 · Protocolo de exclusão',
        'Excluir dependente',
        'Solicitação realizada.\nProtocolo: 123456789.\nDependente: Maria José da Silva.\nA data efetiva do documento de referência precisa ser corrigida.',
        {
          actions: [action('Excluir outro', 'LEG-159'), action('Menu', 'LEG-144')],
          rule: 'O documento original contém 31/02/2026, data inválida. Não replicada como data válida.',
        },
      ),
      screen(
        'LEG-166',
        '166 · Iniciar cancelamento',
        'Cancelar assistência',
        'Vamos consultar o cancelamento.',
      ),
      screen(
        'LEG-167',
        '167 · Alerta de perdas',
        'Cancelar assistência',
        'Após o cancelamento, você e seus dependentes perderão acesso às coberturas contratadas. Como deseja prosseguir?',
        { actions: [action('Manter assistência', 'LEG-144'), action('Sim, cancelar', 'LEG-168')] },
      ),
      screen(
        'LEG-168',
        '168 · Confirmar desistência',
        'Sim, cancelar assistência',
        'Vamos registrar o motivo.',
      ),
      screen(
        'LEG-169',
        '169 · Solicitar motivo',
        'Cancelar',
        'Para continuar, selecione o motivo do cancelamento.',
        { actions: [action('Selecionar motivo', 'LEG-170')] },
      ),
      screen(
        'LEG-170',
        '170 · Lista de motivos',
        'Selecionar motivo',
        'Conte por que está cancelando.',
        list(
          'Motivo do cancelamento',
          [
            'O valor não compensa',
            'Não utilizei o benefício',
            'Contratei outro serviço',
            'Desisti da contratação',
            'Outro motivo',
          ].map((label) => ({ label, target: 'LEG-171' })),
          'Confirmar cancelamento',
        ),
      ),
      screen('LEG-171', '171 · Motivo enviado', 'Outro motivo', 'Motivo recebido.'),
      screen(
        'LEG-172',
        '172 · Encerramento',
        'Outro motivo',
        'Sua assistência será cancelada.\nProtocolo: 123456789.\nVigência e restituição dependem da regra aplicável. O documento legado apresenta informações divergentes de prazo e destino.',
        {
          actions: [action('Encerrar atendimento', 'ENT-02')],
          rule: 'Legado diverge entre conta/cartão e 20 dias/20 dias úteis. Requer validação; não assumido como regra.',
        },
      ),
    ],
  );

  const index = {};
  for (const group of groups) {
    group.steps.forEach((step, position) => {
      step.journey = group.code;
      // Deny by default: only these informational screens are public.
      step.requiresAuth = ![
        'ENT-01', 'ENT-02', 'ENT-03', 'ENT-04', 'ENT-05', 'ENT-09', 'FAQ-01', 'FAQ-02', 'FAQ-03', 'FAQ-04', 'FAQ-05', 'FIM-01', 'FIM-02',
        'NAV-01', 'DES-01', 'DES-02', 'DES-03', 'DES-04', 'DES-05', 'DES-06',
        'DES-09', 'DES-10', 'DES-11', 'DES-12', 'DES-13', 'DES-14', 'HUM-01', 'HUM-02', 'HUM-03',
        'AUD-01', 'AUD-03', 'AUD-04',
      ].includes(step.id) && group.code !== 'IDE';
      step.position = position;
      step.rule ??= group.rule;
      step.intent ??= step.user || 'Receber atualização de serviço.';
      step.behavior ??= step.alternative
        ? 'Explicar a situação e oferecer o próximo passo sem perder o contexto.'
        : step.bot;
      const next = group.steps.slice(position + 1).find((item) => !item.alternative);
      step.next = next?.id || null;
      index[step.id] = step;
    });
  }
  window.EXPERIENCE = {
    groups,
    index,
    total: Object.keys(index).length,
    version: '1.0',
    demoDate: '10/10/2026',
  };
})();
