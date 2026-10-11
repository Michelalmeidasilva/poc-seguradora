import quoteFlowJson from './flows/cotacao.flow.json';
import { CLAIM_TYPES } from './identifiers';
import type {
  Claim,
  ClaimOpened,
  ClaimStatus,
  ClaimType,
  Money,
  Policy,
  PolicyStatus,
  PolicySummary,
  Product,
  Quote,
  SecondCopy,
} from './models';
import type { ReplyBody } from './reply';

type TemplatePayload = Extract<ReplyBody, { type: 'message.template' }>['payload'];
type Button = TemplatePayload['buttons'][number];
type QuickOption = Extract<
  ReplyBody,
  { type: 'message.quick_replies' }
>['payload']['options'][number];

const PRODUCT_LABEL: Record<Product, string> = {
  AUTO: 'Auto',
  RESIDENCIAL: 'Residencial',
  VIDA: 'Vida',
};
const POLICY_STATUS_LABEL: Record<PolicyStatus, string> = {
  ATIVA: 'Ativa',
  VENCIDA: 'Vencida',
  CANCELADA: 'Cancelada',
};
const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  ABERTO: 'Aberto',
  EM_ANALISE: 'Em análise',
  APROVADO: 'Aprovado',
  NEGADO: 'Negado',
  ENCERRADO: 'Encerrado',
};
const CLAIM_TYPE_LABEL: Partial<Record<ClaimType, string>> = {
  COLISAO: 'Colisão',
  ROUBO: 'Roubo',
  OUTROS: 'Outros',
};

export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  const reais = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}R$ ${reais},${String(abs % 100).padStart(2, '0')}`;
}

export function formatDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

const money = (m: Money) => formatCents(m.valorCentavos);
const text = (t: string): ReplyBody => ({ type: 'message.text', payload: { text: t } });
const quick = (t: string, options: QuickOption[]): ReplyBody => ({
  type: 'message.quick_replies',
  payload: { text: t, options },
});
const template = (payload: TemplatePayload): ReplyBody => ({ type: 'message.template', payload });
const MENU_BUTTON: Button = { type: 'quick_reply', id: 'menu', title: 'Menu principal' };
const MENU_OPTION: QuickOption = { id: 'menu', title: 'Menu principal' };

export const menu = (): ReplyBody[] => [
  text('Olá! Eu sou o assistente virtual da Seguradora. Como posso ajudar?'),
  quick('Escolha uma opção:', [
    { id: 'menu.quote', title: 'Fazer cotação' },
    { id: 'menu.policies', title: 'Minhas apólices' },
    { id: 'menu.claim', title: 'Abrir sinistro' },
  ]),
];

export const askCpf = (purpose: 'policies' | 'claim'): ReplyBody[] => [
  text(
    purpose === 'policies'
      ? 'Para consultar suas apólices, informe seu CPF (somente números).'
      : 'Para abrir um sinistro, informe o CPF do segurado (somente números).',
  ),
];

export const invalidCpf = (): ReplyBody[] => [
  text('Não consegui entender o CPF. Envie os 11 números, com ou sem pontos e traço.'),
];

export const noPolicies = (): ReplyBody[] => [
  text('Não encontrei apólices para esse CPF.'),
  quick('Posso ajudar com outra coisa?', [MENU_OPTION]),
];

export const noActivePolicies = (): ReplyBody[] => [
  text('Não encontrei apólices ativas para esse CPF, então não é possível abrir um sinistro.'),
  quick('Posso ajudar com outra coisa?', [MENU_OPTION]),
];

export function policyChoices(
  policies: PolicySummary[],
  prefix: 'policy' | 'claimpolicy',
): ReplyBody[] {
  const shown = policies.slice(0, 3);
  const lines = shown.map(
    (p) => `${p.numero} · ${PRODUCT_LABEL[p.produto]} · ${POLICY_STATUS_LABEL[p.status]}`,
  );
  const more =
    policies.length > shown.length ? `\n(mostrando ${shown.length} de ${policies.length})` : '';
  return [
    text(`Encontrei estas apólices:\n${lines.join('\n')}${more}`),
    quick(
      'Qual delas?',
      shown.map((p) => ({ id: `${prefix}:${p.numero}`, title: p.numero })),
    ),
  ];
}

export function policyDetail(p: Policy): ReplyBody[] {
  const lines = [
    `Produto: ${PRODUCT_LABEL[p.produto]}`,
    `Situação: ${POLICY_STATUS_LABEL[p.status]}`,
    `Vigência: ${formatDate(p.vigencia.inicio)} a ${formatDate(p.vigencia.fim)}`,
    `Prêmio: ${money(p.premio)} (${p.premio.periodicidade.toLowerCase()})`,
  ];
  if (p.proximoVencimento) lines.push(`Próximo vencimento: ${formatDate(p.proximoVencimento)}`);
  const buttons: Button[] = [];
  if (p.status !== 'CANCELADA') {
    buttons.push({
      type: 'quick_reply',
      id: `policy.second_copy:${p.numero}`,
      title: 'Segunda via',
    });
  }
  if (p.status === 'ATIVA') {
    buttons.push({ type: 'quick_reply', id: `policy.claim:${p.numero}`, title: 'Abrir sinistro' });
  }
  buttons.push(MENU_BUTTON);
  return [template({ header: `Apólice ${p.numero}`, body: lines.join('\n'), buttons })];
}

export const secondCopy = (sc: SecondCopy): ReplyBody[] => [
  template({
    header: `Segunda via ${sc.numero}`,
    body: `Sua segunda via está pronta. O link vale até ${formatDate(sc.expiraEm)}.`,
    buttons: [{ type: 'url', title: 'Abrir documento', url: sc.documentoUrl }, MENU_BUTTON],
  }),
];

export const secondCopyRejected = (): ReplyBody[] => [
  text('Não é possível gerar a segunda via dessa apólice porque ela está cancelada.'),
  quick('Posso ajudar com outra coisa?', [MENU_OPTION]),
];

export const quoteFlow = (): ReplyBody[] => [
  {
    type: 'message.flow',
    payload: {
      flowId: 'cotacao',
      body: 'Vamos fazer sua cotação. Toque no botão e preencha o formulário.',
      ctaLabel: 'Começar',
      flowJson: quoteFlowJson,
    },
  },
];

export const quoteInvalid = (): ReplyBody[] => [
  text('Alguns dados do formulário não são válidos. Vamos tentar de novo.'),
  ...quoteFlow(),
];

export function quoteResult(q: Quote): ReplyBody[] {
  const lines = [
    `Produto: ${PRODUCT_LABEL[q.produto]}`,
    `Prêmio mensal: ${money(q.premioMensal)}`,
    `Válida até: ${formatDate(q.validaAte)}`,
  ];
  const replies: ReplyBody[] = [
    template({
      header: `Cotação ${q.cotacaoId}`,
      body: lines.join('\n'),
      footer: 'Valores sujeitos a análise.',
      buttons: [MENU_BUTTON],
    }),
  ];
  const cards = q.coberturas.slice(0, 10);
  if (cards.length >= 2) {
    replies.push({
      type: 'message.carousel',
      payload: {
        cards: cards.map((c) => ({
          mediaUrl: `https://exemplo.invalid/coberturas/${encodeURIComponent(c.codigo.toLowerCase())}.png`,
          mediaType: 'image' as const,
          title: c.nome.slice(0, 60),
          body: `Limite: ${formatCents(c.limiteCentavos)}`,
          buttons: [],
        })),
      },
    });
  }
  return replies;
}

export const claimTypeChoices = (apolice?: string): ReplyBody[] => [
  quick(
    apolice
      ? `Vou abrir o sinistro da apólice ${apolice}. Qual foi o tipo?`
      : 'Qual foi o tipo do sinistro?',
    CLAIM_TYPES.map((t) => ({ id: `claim.type:${t}`, title: CLAIM_TYPE_LABEL[t] ?? t })),
  ),
];

export const askClaimDescription = (): ReplyBody[] => [
  text('Descreva o que aconteceu (até 1000 caracteres).'),
];

export const descriptionTooLong = (): ReplyBody[] => [
  text('A descrição ficou longa demais. Resuma em até 1000 caracteres.'),
];

export const claimOpened = (c: ClaimOpened): ReplyBody[] => [
  text(
    `Sinistro registrado! Previsão de retorno: ${formatDate(c.previsaoRetorno)}. Guarde o protocolo:`,
  ),
  { type: 'message.code', payload: { code: `Protocolo: ${c.protocolo}` } },
  quick('Posso ajudar com mais alguma coisa?', [MENU_OPTION]),
];

export const askClaimProtocol = (): ReplyBody[] => [
  text('Informe o protocolo do sinistro, por exemplo SN-2001.'),
];

export function claimDetail(c: Claim): ReplyBody[] {
  const timeline = c.timeline
    .slice(-6)
    .map((e) => `${formatDate(e.ts)} · ${CLAIM_STATUS_LABEL[e.status]}: ${e.descricao}`);
  return [
    template({
      header: `Sinistro ${c.protocolo}`,
      body: [
        `Apólice: ${c.apoliceNumero}`,
        `Situação: ${CLAIM_STATUS_LABEL[c.status]}`,
        `Ocorrência: ${formatDate(c.dataOcorrencia)}`,
        '',
        ...timeline,
      ].join('\n'),
      buttons: [MENU_BUTTON],
    }),
  ];
}

export const branchLocation = (): ReplyBody[] => [
  text('Esta é a agência mais próxima:'),
  {
    type: 'message.location',
    payload: {
      latitude: -23.5614,
      longitude: -46.6559,
      name: 'Agência Paulista',
      address: 'Av. Paulista, 1000 - São Paulo',
    },
  },
];

export const voiceReceived = (durationMs: number): ReplyBody[] => [
  text(
    `Recebi seu áudio de ${Math.max(1, Math.round(durationMs / 1000))} s, mas por enquanto só entendo mensagens de texto.`,
  ),
  quick('Escolha uma opção:', [
    { id: 'menu.quote', title: 'Fazer cotação' },
    { id: 'menu.policies', title: 'Minhas apólices' },
    { id: 'menu.claim', title: 'Abrir sinistro' },
  ]),
];

export const unknown = (): ReplyBody[] => [
  text('Não entendi. Posso ajudar com cotação, apólices ou sinistros.'),
  quick('Escolha uma opção:', [
    { id: 'menu.quote', title: 'Fazer cotação' },
    { id: 'menu.policies', title: 'Minhas apólices' },
    { id: 'menu.claim', title: 'Abrir sinistro' },
  ]),
];

export const pickAnOption = (): ReplyBody[] => [
  text('Escolha uma das opções acima ou digite "menu" para voltar ao início.'),
];

export const serviceUnavailable = (): ReplyBody[] => [
  text('Não consegui consultar o sistema agora. Tente novamente em instantes.'),
];

export const notFound = (what: 'policy' | 'claim'): ReplyBody[] => [
  text(
    what === 'policy'
      ? 'Não encontrei essa apólice. Confira o número e tente novamente.'
      : 'Não encontrei esse sinistro. Confira o protocolo e tente novamente.',
  ),
  quick('Posso ajudar com outra coisa?', [MENU_OPTION]),
];

export const conflict = (): ReplyBody[] => [
  text('Essa operação não é possível no estado atual da apólice.'),
  quick('Posso ajudar com outra coisa?', [MENU_OPTION]),
];

export const claimRejected = (): ReplyBody[] => [
  text('Não foi possível abrir o sinistro: a apólice não está ativa.'),
  quick('Posso ajudar com outra coisa?', [MENU_OPTION]),
];

export const invalidData = (): ReplyBody[] => [
  text('Os dados informados não foram aceitos. Vamos recomeçar.'),
  quick('Escolha uma opção:', [
    { id: 'menu.quote', title: 'Fazer cotação' },
    { id: 'menu.policies', title: 'Minhas apólices' },
    { id: 'menu.claim', title: 'Abrir sinistro' },
  ]),
];
