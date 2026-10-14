/** Discovery leads from service information directly into a selected contract. */
export function buildDiscoveryFlow(source) {
  const d = source.discovery;
  const text = (value) => ({ type: 'TextBody', text: value });
  const caption = (value) => ({ type: 'TextCaption', text: value });
  const heading = (value) => ({ type: 'TextSubheading', text: value });
  const nav = (label, next, payload) => ({
    type: 'Footer',
    label,
    'on-click-action': { name: 'navigate', next: { type: 'screen', name: next }, payload },
  });
  const serviceData = { service: { type: 'string', __example__: '0' } };
  const serviceTitle = () => ({
    type: 'Switch',
    value: '${data.service}',
    cases: Object.fromEntries(d.services.map((service) => [service.id, [heading(service.title)]])),
  });
  const screen = (id, title, children, extra = {}) => ({
    id,
    title,
    ...extra,
    layout: { type: 'SingleColumnLayout', children },
  });
  return {
    version: '7.1',
    routing_model: { LIST: ['DETAILS'], DETAILS: ['CONTRACT'], CONTRACT: [] },
    screens: [
      screen('LIST', source.title, [
        text('Escolha um serviço para conhecer os benefícios, planos e valores.'),
        {
          type: 'RadioButtonsGroup',
          name: 'service',
          label: 'Qual serviço quer conhecer?',
          required: true,
          'data-source': source.choices.map((choice, i) => ({
            id: String(i),
            title: choice.label,
            description: choice.detail,
          })),
        },
        nav('Ver detalhes', 'DETAILS', { service: '${form.service}' }),
      ]),
      screen(
        'DETAILS',
        'Detalhes do serviço',
        [
          {
            type: 'Switch',
            value: '${data.service}',
            cases: Object.fromEntries(
              d.services.map((service) => [
                service.id,
                [heading(service.title), text(service.description)],
              ]),
            ),
          },
          heading('Planos e valores'),
          ...d.plans.flatMap((plan) => [
            heading(plan.title),
            text(plan.price),
            caption(plan.composition),
          ]),
          heading('Condições de uso'),
          text(d.conditions),
          nav('Escolher plano', 'CONTRACT', { service: '${data.service}' }),
        ],
        { data: serviceData },
      ),
      screen(
        'CONTRACT',
        'Continuar contratação',
        [
          serviceTitle(),
          {
            type: 'RadioButtonsGroup',
            name: 'modality',
            label: 'Escolha seu plano',
            required: true,
            'data-source': d.plans.map((plan) => ({
              id: plan.id,
              title: plan.title,
              description: plan.description,
            })),
          },
          {
            type: 'TextInput',
            name: 'cpf',
            label: 'CPF',
            required: true,
            'input-type': 'cpf',
            'min-chars': 11,
            'max-chars': 14,
            'helper-text': 'Informe 11 dígitos, com ou sem pontuação.',
            'error-message': 'Informe um CPF com 11 dígitos.',
          },
          caption(
            'Continue no chat com o serviço e o plano escolhidos para concluir sua contratação.',
          ),
          {
            type: 'Footer',
            label: 'Continuar contratação',
            'on-click-action': {
              name: 'complete',
              payload: {
                intent: 'contract',
                service: '${data.service}',
                modality: '${form.modality}',
                cpf: '${form.cpf}',
              },
            },
          },
        ],
        { data: serviceData, terminal: true, success: true },
      ),
    ],
  };
}
