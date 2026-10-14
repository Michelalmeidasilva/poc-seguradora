/** Build the existing multi-screen Flow runtime from the canonical discovery content. */
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
  const carry = { service: '${data.service}', modality: '${data.modality}' };
  const data = (...names) =>
    Object.fromEntries(
      names.map((name) => [
        name,
        { type: 'string', __example__: name === 'service' ? '0' : 'familiar' },
      ]),
    );
  const screen = (id, title, children, extra = {}) => ({
    id,
    title,
    ...extra,
    layout: { type: 'SingleColumnLayout', children },
  });
  const planSummary = () => ({
    type: 'Switch',
    value: '${data.modality}',
    cases: Object.fromEntries(
      d.plans.map((plan) => [
        plan.id,
        [heading(plan.title), text(plan.price), text(plan.composition)],
      ]),
    ),
  });
  return {
    version: '7.1',
    routing_model: {
      LIST: ['DETAILS'],
      DETAILS: ['PLANS'],
      PLANS: ['CONDITIONS'],
      CONDITIONS: ['FINISH'],
      FINISH: [],
    },
    screens: [
      screen('LIST', source.title, [
        text('Explore os três serviços, veja os detalhes e compare os planos sem sair deste Flow.'),
        {
          type: 'RadioButtonsGroup',
          name: 'service',
          label: source.title,
          required: true,
          'data-source': source.choices.map((choice, i) => ({
            id: String(i),
            title: choice.label,
            description: choice.detail,
          })),
        },
        caption(d.note),
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
                [heading(service.title), text(service.description), caption(service.note)],
              ]),
            ),
          },
          caption(
            'Use Voltar para conhecer outro serviço. Todas as etapas continuam neste mesmo Flow.',
          ),
          nav('Ver planos', 'PLANS', { service: '${data.service}' }),
        ],
        { data: data('service') },
      ),
      screen(
        'PLANS',
        'Planos e comparação',
        [
          heading('Comparação de planos'),
          text(d.comparison),
          {
            type: 'RadioButtonsGroup',
            name: 'modality',
            label: 'Qual plano deseja conhecer?',
            required: true,
            'data-source': d.plans.map((plan) => ({
              id: plan.id,
              title: plan.title,
              description: plan.description,
            })),
          },
          caption(d.note),
          nav('Ver condições', 'CONDITIONS', {
            service: '${data.service}',
            modality: '${form.modality}',
          }),
        ],
        { data: data('service') },
      ),
      screen(
        'CONDITIONS',
        'Condições do plano',
        [planSummary(), text(d.conditions), caption(d.note), nav('Continuar', 'FINISH', carry)],
        { data: data('service', 'modality') },
      ),
      screen(
        'FINISH',
        'Concluir descoberta',
        [
          planSummary(),
          text(
            'Você pode concluir a descoberta ou iniciar uma contratação. Iniciar não contrata nem cobra: primeiro será necessário informar o CPF e revisar os dados e condições.',
          ),
          {
            type: 'RadioButtonsGroup',
            name: 'intent',
            label: 'Como deseja continuar?',
            required: true,
            'data-source': d.outcomes.map((outcome) => ({ id: outcome.id, title: outcome.label })),
          },
          {
            type: 'Footer',
            label: 'Concluir',
            'on-click-action': {
              name: 'complete',
              payload: { ...carry, intent: '${form.intent}' },
            },
          },
        ],
        { data: data('service', 'modality'), terminal: true, success: true },
      ),
    ],
  };
}
