/** Local component catalog only: deliberately independent of canonical business journeys. */
export function showcaseFlow(origin: string): Record<string, unknown> {
  const image = new URL('/catalog/family.svg', origin).href;
  const imageHealth = new URL('/catalog/health.svg', origin).href;
  return {
    version: '7.1',
    routing_model: { FORM: ['CONDITIONS'], CONDITIONS: [] },
    screens: [
      {
        id: 'FORM',
        title: 'Solicitar assistência',
        terminal: true,
        layout: {
          type: 'SingleColumnLayout',
          children: [
            { type: 'TextHeading', text: 'Vamos cuidar do seu pedido' },
            { type: 'TextSubheading', text: 'Solicitação de atendimento' },
            {
              type: 'TextBody',
              text: 'Preencha os dados da solicitação e escolha o serviço desejado.',
            },

            {
              type: 'Image',
              src: image,
              'alt-text': 'Assistência Funeral',
              height: 130,
            },
            { type: 'TextInput', name: 'nome', label: 'Nome completo', required: true },
            { type: 'TextArea', name: 'observacoes', label: 'O que aconteceu?' },
            {
              type: 'RadioButtonsGroup',
              name: 'servico',
              label: 'Tipo de atendimento',
              'data-source': [
                { id: 'FUNERAL', title: 'Assistência Funeral' },
                { id: 'FARMACIA', title: 'Assistência Farmácia' },
                { id: 'TELEMEDICINA', title: 'Telemedicina' },
              ],
            },
            {
              type: 'Switch',
              value: '${form.servico}',
              cases: {
                FUNERAL: [
                  {
                    type: 'TextCaption',
                    text: 'Assistência Funeral: apoio e acolhimento à família.',
                  },
                ],
                FARMACIA: [
                  {
                    type: 'TextCaption',
                    text: 'Assistência Farmácia: descontos em redes credenciadas.',
                  },
                ],
                TELEMEDICINA: [
                  { type: 'TextCaption', text: 'Telemedicina: atendimento médico a distância.' },
                ],
              },
            },
            {
              type: 'CheckboxGroup',
              name: 'coberturas',
              label: 'Coberturas',
              'data-source': [
                { id: 'EMERGENCIAL', title: 'Atendimento emergencial' },
                { id: 'ORIENTACAO', title: 'Orientação especializada' },
              ],
            },
            {
              type: 'Dropdown',
              name: 'periodo',
              label: 'Melhor período',
              'data-source': [
                { id: 'MANHA', title: 'Manhã' },
                { id: 'TARDE', title: 'Tarde' },
                { id: 'NOITE', title: 'Noite' },
              ],
            },
            {
              type: 'ChipsSelector',
              name: 'contato',
              label: 'Preferências de contato',
              'data-source': [
                { id: 'WHATSAPP', title: 'WhatsApp' },
                { id: 'TELEFONE', title: 'Telefone' },
              ],
            },
            { type: 'DatePicker', name: 'data', label: 'Data preferida' },
            { type: 'CalendarPicker', name: 'agenda', label: 'Dia do atendimento', mode: 'single' },
            {
              type: 'CalendarPicker',
              name: 'intervalo',
              label: 'Período disponível',
              mode: 'range',
            },
            {
              type: 'PhotoPicker',
              name: 'fotos',
              label: 'Fotos e documentos de apoio',
              'photo-source': 'gallery',
              'max-uploaded-photos': 2,
            },
            { type: 'OptIn', name: 'aceite', label: 'Li as condições do serviço' },
            {
              type: 'If',
              condition: '${form.aceite}',
              then: [
                {
                  type: 'TextBody',
                  text: 'Condições aceitas. Você pode concluir sua solicitação.',
                },
              ],
              else: [{ type: 'TextCaption', text: 'Você pode consultar as condições abaixo.' }],
            },
            {
              type: 'NavigationList',
              name: 'condicoes',
              'list-items': [
                {
                  id: 'condicoes',
                  'main-content': {
                    title: 'Condições e orientações',
                    description: 'Conheça os textos e imagens do formulário',
                  },
                  'on-click-action': {
                    name: 'navigate',
                    next: { type: 'screen', name: 'CONDITIONS' },
                    payload: {},
                  },
                },
              ],
            },
            {
              type: 'Footer',
              label: 'Concluir solicitação',
              'on-click-action': { name: 'complete', payload: {} },
            },
          ],
        },
      },
      {
        id: 'CONDITIONS',
        title: 'Condições do serviço',
        terminal: true,
        layout: {
          type: 'SingleColumnLayout',
          children: [
            {
              type: 'RichText',
              text: [
                '# Sua assistência',
                'Serviços sujeitos às **coberturas e limites** do plano contratado.',
                '- Consulte os benefícios do serviço escolhido.',
                '- Acompanhe os próximos passos na conversa.',
              ],
            },
            {
              type: 'DocumentPicker',
              name: 'documento',
              label: 'Documento do plano',
              'allowed-mime-types': ['application/pdf'],
              'max-uploaded-documents': 1,
            },
            {
              type: 'ImageCarousel',
              images: [
                { src: image, 'alt-text': 'Assistência Funeral' },
                { src: imageHealth, 'alt-text': 'Telemedicina' },
              ],
            },
            {
              type: 'EmbeddedLink',
              text: 'Confirmar leitura',
              'on-click-action': { name: 'update_data', payload: { lido: true } },
            },
            {
              type: 'If',
              condition: '${data.lido} == true',
              then: [{ type: 'TextCaption', text: 'Leitura confirmada.' }],
              else: [],
            },
            {
              type: 'Footer',
              label: 'Concluir solicitação',
              'on-click-action': { name: 'complete', payload: {} },
            },
          ],
        },
      },
    ],
  };
}
