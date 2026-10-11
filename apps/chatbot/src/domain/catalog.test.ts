import { FlowPayload, LIMITS, parseChatbotLine } from '@seguradora/protocol';
import { describe, expect, it } from 'vitest';
import {
  aClaim,
  aClaimOpened,
  aPolicy,
  aPolicySummary,
  aQuote,
  aSecondCopy,
} from '../test/fixtures';
import * as catalog from './catalog';
import demoFlowJson from './flows/demo-componentes.flow.json';
import type { ReplyBody } from './reply';

/** Wraps a reply in the event envelope and runs it through the real protocol schema. */
const validates = (body: ReplyBody): boolean =>
  parseChatbotLine(
    JSON.stringify({
      v: 1,
      id: '00000000-0000-4000-8000-000000000001',
      sessionId: 's1',
      correlationId: 'c1',
      ts: '2026-10-10T12:00:00.000Z',
      ...body,
    }),
  ).ok;

const everyReply: Array<[string, ReplyBody[]]> = [
  ['menu', catalog.menu()],
  ['askCpf policies', catalog.askCpf('policies')],
  ['askCpf claim', catalog.askCpf('claim')],
  ['invalidCpf', catalog.invalidCpf()],
  ['noPolicies', catalog.noPolicies()],
  ['noActivePolicies', catalog.noActivePolicies()],
  [
    'policyChoices',
    catalog.policyChoices([aPolicySummary(), aPolicySummary({ numero: 'AP-1002' })], 'policy'),
  ],
  ['policyDetail active', catalog.policyDetail(aPolicy())],
  [
    'policyDetail cancelled',
    catalog.policyDetail(aPolicy({ status: 'CANCELADA', proximoVencimento: null })),
  ],
  ['secondCopy', catalog.secondCopy(aSecondCopy())],
  ['secondCopyRejected', catalog.secondCopyRejected()],
  ['quoteFlow', catalog.quoteFlow()],
  ['quoteInvalid', catalog.quoteInvalid()],
  ['quoteResult', catalog.quoteResult(aQuote())],
  [
    'quoteResult single coverage',
    catalog.quoteResult(aQuote({ coberturas: [aQuote().coberturas[0]!] })),
  ],
  ['claimTypeChoices', catalog.claimTypeChoices('AP-1001')],
  ['askClaimDescription', catalog.askClaimDescription()],
  ['claimOpened', catalog.claimOpened(aClaimOpened())],
  ['askClaimProtocol', catalog.askClaimProtocol()],
  ['claimDetail', catalog.claimDetail(aClaim())],
  ['branchLocation', catalog.branchLocation()],
  ['voiceReceived', catalog.voiceReceived(4200)],
  ['unknown', catalog.unknown()],
  ['serviceUnavailable', catalog.serviceUnavailable()],
  ['notFound policy', catalog.notFound('policy')],
  ['notFound claim', catalog.notFound('claim')],
  ['conflict', catalog.conflict()],
  ['invalidData', catalog.invalidData()],
  ['claimRejected', catalog.claimRejected()],
  ['descriptionTooLong', catalog.descriptionTooLong()],
  ['pickAnOption', catalog.pickAnOption()],
  ['demoFlow', catalog.demoFlow()],
  ['demoFlowReceived', catalog.demoFlowReceived()],
];

describe('catalog', () => {
  it.each(everyReply)(
    '%s only produces events accepted by the protocol schema',
    (_name, replies) => {
      expect(replies.length).toBeGreaterThan(0);
      for (const reply of replies) expect(validates(reply)).toBe(true);
    },
  );

  it('offers exactly the three main options in the menu', () => {
    const quick = catalog.menu().find((r) => r.type === 'message.quick_replies');
    expect(
      quick?.type === 'message.quick_replies' && quick.payload.options.map((o) => o.id),
    ).toEqual(['menu.quote', 'menu.policies', 'menu.claim']);
  });

  it('limits policy choices to three and prefixes the option ids', () => {
    const many = ['AP-1001', 'AP-1002', 'AP-1003', 'AP-1004'].map((numero) =>
      aPolicySummary({ numero }),
    );
    const quick = catalog
      .policyChoices(many, 'claimpolicy')
      .find((r) => r.type === 'message.quick_replies');
    expect(
      quick?.type === 'message.quick_replies' && quick.payload.options.map((o) => o.id),
    ).toEqual(['claimpolicy:AP-1001', 'claimpolicy:AP-1002', 'claimpolicy:AP-1003']);
  });

  it('only offers a second copy and a claim for the policies that allow them', () => {
    const buttons = (policy: ReturnType<typeof aPolicy>) => {
      const t = catalog.policyDetail(policy).find((r) => r.type === 'message.template');
      return t?.type === 'message.template'
        ? t.payload.buttons.map((b) => (b.type === 'quick_reply' ? b.id : b.type))
        : [];
    };
    expect(buttons(aPolicy())).toEqual([
      'policy.second_copy:AP-1001',
      'policy.claim:AP-1001',
      'menu',
    ]);
    expect(buttons(aPolicy({ status: 'VENCIDA' }))).toEqual(['policy.second_copy:AP-1001', 'menu']);
    expect(buttons(aPolicy({ status: 'CANCELADA' }))).toEqual(['menu']);
  });

  it('shows a carousel of coverages only when there are at least two', () => {
    const types = (q: ReturnType<typeof aQuote>) => catalog.quoteResult(q).map((r) => r.type);
    expect(types(aQuote())).toEqual(['message.template', 'message.carousel']);
    expect(types(aQuote({ coberturas: [aQuote().coberturas[0]!] }))).toEqual(['message.template']);
  });

  it('puts the claim protocol in a code message', () => {
    const code = catalog.claimOpened(aClaimOpened()).find((r) => r.type === 'message.code');
    expect(code?.type === 'message.code' && code.payload.code).toContain('SN-2002');
  });

  it('builds the quote flow with the cotacao flow id and the Flow JSON', () => {
    const flow = catalog.quoteFlow().find((r) => r.type === 'message.flow');
    expect(flow?.type === 'message.flow' && flow.payload.flowId).toBe('cotacao');
    expect(flow?.type === 'message.flow' && Array.isArray(flow.payload.flowJson.screens)).toBe(
      true,
    );
  });

  it('does not put an unsafe document URL in a button', () => {
    const t = catalog.secondCopy(aSecondCopy()).find((r) => r.type === 'message.template');
    const url =
      t?.type === 'message.template' ? t.payload.buttons.find((b) => b.type === 'url') : undefined;
    expect(url?.type === 'url' && url.url).toBe('https://exemplo.invalid/docs/AP-1001.pdf');
  });
});

describe('formatting', () => {
  it.each([
    [18990, 'R$ 189,90'],
    [5000000, 'R$ 50.000,00'],
    [5, 'R$ 0,05'],
    [0, 'R$ 0,00'],
    [123456789, 'R$ 1.234.567,89'],
  ])('formatCents(%d) = %s', (cents, expected) => {
    expect(catalog.formatCents(cents)).toBe(expected);
  });

  it('formats an ISO date or timestamp as dd/mm/yyyy', () => {
    expect(catalog.formatDate('2026-10-10')).toBe('10/10/2026');
    expect(catalog.formatDate('2026-10-02T14:00:00Z')).toBe('02/10/2026');
  });
});

type FlowNode = { type?: string; label?: string; 'helper-text'?: string; [k: string]: unknown };

function* walk(nodes: unknown): Generator<FlowNode> {
  if (!Array.isArray(nodes)) return;
  for (const n of nodes as FlowNode[]) {
    yield n;
    const cases = n.cases;
    if (n.type === 'Switch' && cases && typeof cases === 'object') {
      for (const list of Object.values(cases)) yield* walk(list);
    }
  }
}

describe('quote flow limits', () => {
  it('respects the WhatsApp Flow component text limits', () => {
    const flow = catalog.quoteFlow().find((r) => r.type === 'message.flow');
    if (flow?.type !== 'message.flow') throw new Error('no flow');
    const screens = flow.payload.flowJson.screens as Array<{ layout: { children: unknown } }>;
    let checked = 0;
    for (const screen of screens) {
      for (const c of walk(screen.layout.children)) {
        const label = c.label ?? '';
        if (c.type === 'TextInput' || c.type === 'TextArea') {
          expect(label.length, label).toBeLessThanOrEqual(20);
          if (c['helper-text']) expect(c['helper-text'].length).toBeLessThanOrEqual(80);
        } else if (c.type === 'DatePicker') {
          expect(label.length, label).toBeLessThanOrEqual(40);
        } else if (c.type === 'Footer') {
          expect(label.length, label).toBeLessThanOrEqual(35);
        } else if (c.type === 'RadioButtonsGroup') {
          expect(label.length, label).toBeLessThanOrEqual(30);
          for (const o of c['data-source'] as Array<{ title: string }>) {
            expect(o.title.length).toBeLessThanOrEqual(30);
          }
        } else continue;
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('uses text inputs for cpf and cep so leading zeros survive', () => {
    const flow = catalog.quoteFlow().find((r) => r.type === 'message.flow');
    if (flow?.type !== 'message.flow') throw new Error('no flow');
    const screens = flow.payload.flowJson.screens as Array<{ layout: { children: unknown } }>;
    const names: string[] = [];
    for (const screen of screens) {
      for (const c of walk(screen.layout.children)) {
        if (c.type === 'TextInput' && (c.name === 'cpf' || c.name === 'cep')) {
          expect(c['input-type']).toBe('text');
          names.push(String(c.name));
        }
      }
    }
    expect(names.filter((n) => n === 'cep')).toHaveLength(2);
    expect(names).toContain('cpf');
  });

  it('marks cpf and nascimento as sensitive on the DADOS screen', () => {
    const flow = catalog.quoteFlow().find((r) => r.type === 'message.flow');
    if (flow?.type !== 'message.flow') throw new Error('no flow');
    const screens = flow.payload.flowJson.screens as Array<{ id: string; sensitive?: unknown }>;
    const dados = screens.find((s) => s.id === 'DADOS');
    expect(Array.isArray(dados?.sensitive) && [...dados.sensitive].sort()).toEqual([
      'cpf',
      'nascimento',
    ]);
  });

  it('returns a fresh copy of the flow on every call', () => {
    const first = catalog.quoteFlow().find((r) => r.type === 'message.flow');
    if (first?.type !== 'message.flow') throw new Error('no flow');
    (first.payload.flowJson as { version: string }).version = 'mutated';
    const second = catalog.quoteFlow().find((r) => r.type === 'message.flow');
    expect(second?.type === 'message.flow' && second.payload.flowJson.version).toBe('6.2');
  });
});

describe('demo flow', () => {
  const demo = () => {
    const replies = catalog.demoFlow();
    expect(replies).toHaveLength(1);
    const [flow] = replies;
    if (flow?.type !== 'message.flow') throw new Error('no flow');
    return flow;
  };

  it('sends the demo Flow JSON with the fixed header and call to action', () => {
    const { payload } = demo();
    expect(payload.flowId).toBe('demo');
    expect(payload.header).toBe('Demonstração');
    expect(payload.ctaLabel).toBe('Abrir demonstração');
    expect(payload.flowJson).toEqual(demoFlowJson);
    expect(payload.body).toMatch(/demonstração/i);
    expect(payload.body).toMatch(/nenhum dado/i);
  });

  it('satisfies the protocol FlowPayload schema and stays well below the event size limit', () => {
    const flow = demo();
    expect(FlowPayload.safeParse(flow.payload).success).toBe(true);
    const serialized = JSON.stringify({
      v: 1,
      id: '00000000-0000-4000-8000-000000000001',
      sessionId: 's1',
      correlationId: 'c1',
      ts: '2026-10-10T12:00:00.000Z',
      ...flow,
    });
    const bytes = Buffer.byteLength(serialized, 'utf8');
    expect(bytes).toBeLessThan(32768);
    expect(bytes).toBeLessThan(LIMITS.maxEventBytes);
  });

  it('returns a fresh copy of the demo Flow JSON on every call', () => {
    (demo().payload.flowJson as { version: string }).version = 'mutated';
    expect(demo().payload.flowJson.version).toBe(demoFlowJson.version);
  });

  it('acknowledges a demo submission with a fixed text and the menu option only', () => {
    expect(catalog.demoFlowReceived.length).toBe(0);
    const replies = catalog.demoFlowReceived();
    expect(replies.map((r) => r.type)).toEqual(['message.text', 'message.quick_replies']);
    const [first, second] = replies;
    expect(first?.type === 'message.text' && first.payload.text).toBe(
      'Recebi o formulário de demonstração. Nenhum dado foi guardado.',
    );
    expect(second?.type === 'message.quick_replies' && second.payload.options).toEqual([
      { id: 'menu', title: 'Menu principal' },
    ]);
  });
});

describe('service-provided strings', () => {
  const long = (n: number, ch = 'x') => ch.repeat(n);

  it('keeps claimDetail valid with very long timeline descriptions', () => {
    const entry = { ts: '2026-10-01T09:00:00Z', status: 'ABERTO' as const, descricao: long(2000) };
    const replies = catalog.claimDetail(aClaim({ timeline: Array(6).fill(entry) }));
    for (const r of replies) expect(validates(r)).toBe(true);
  });

  it('keeps policyDetail valid with a very long number and fields', () => {
    const replies = catalog.policyDetail(
      aPolicy({
        numero: long(500),
        premio: { valorCentavos: 1, moeda: 'BRL', periodicidade: long(300) },
      }),
    );
    for (const r of replies) expect(validates(r)).toBe(true);
  });

  it('keeps quoteResult valid with a long id and long coverage names', () => {
    const q = aQuote({
      cotacaoId: long(500),
      coberturas: [
        { codigo: 'A', nome: long(500), limiteCentavos: 1 },
        { codigo: 'B', nome: long(500), limiteCentavos: 1 },
      ],
    });
    for (const r of catalog.quoteResult(q)) expect(validates(r)).toBe(true);
  });

  it('keeps policyChoices valid with a long number', () => {
    const replies = catalog.policyChoices([aPolicySummary({ numero: long(500) })], 'policy');
    for (const r of replies) expect(validates(r)).toBe(true);
  });

  it('keeps secondCopy valid with a long number', () => {
    for (const r of catalog.secondCopy(aSecondCopy({ numero: long(500) }))) {
      expect(validates(r)).toBe(true);
    }
  });

  it('returns a malformed date unchanged', () => {
    expect(catalog.formatDate('lixo')).toBe('lixo');
  });

  it('never prints NaN for the voice duration', () => {
    const texts = catalog.voiceReceived(Number.NaN).map((r) => JSON.stringify(r));
    expect(texts.join('')).not.toContain('NaN');
    expect(texts[0]).toContain('1 s');
  });
});

describe('catalog details', () => {
  it('encodes the carousel image url and caps the cards at ten', () => {
    const one = catalog.quoteResult(
      aQuote({
        coberturas: [
          { codigo: 'A B/C', nome: 'n', limiteCentavos: 1 },
          { codigo: 'D', nome: 'n', limiteCentavos: 1 },
        ],
      }),
    );
    const c1 = one.find((r) => r.type === 'message.carousel');
    expect(c1?.type === 'message.carousel' && c1.payload.cards[0]?.mediaUrl).toMatch(
      /\/coberturas\/a%20b%2Fc\.png$/,
    );
    const many = Array.from({ length: 12 }, (_, i) => ({
      codigo: `C${i}`,
      nome: 'n',
      limiteCentavos: 1,
    }));
    const c2 = catalog
      .quoteResult(aQuote({ coberturas: many }))
      .find((r) => r.type === 'message.carousel');
    expect(c2?.type === 'message.carousel' && c2.payload.cards.length).toBe(10);
  });

  it('says how many policies are shown when there are more than three', () => {
    const four = ['AP-1001', 'AP-1002', 'AP-1003', 'AP-1004'].map((numero) =>
      aPolicySummary({ numero }),
    );
    const t = catalog.policyChoices(four, 'policy').find((r) => r.type === 'message.text');
    expect(t?.type === 'message.text' && t.payload.text).toContain('(mostrando 3 de 4)');
  });

  it('puts the minus sign of a negative amount before the currency symbol', () => {
    expect(catalog.formatCents(-12345)).toBe('-R$ 123,45');
  });
});
