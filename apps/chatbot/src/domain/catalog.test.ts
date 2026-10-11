import { parseChatbotLine } from '@seguradora/protocol';
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
