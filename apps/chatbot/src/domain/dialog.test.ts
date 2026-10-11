import { err, ok } from '@seguradora/protocol';
import { describe, expect, it } from 'vitest';
import {
  aClaim,
  aClaimOpened,
  aPolicy,
  aPolicySummary,
  aQuote,
  aSecondCopy,
} from '../test/fixtures';
import { drive, type Fakes } from '../test/drive';
import { IDLE, next, type DialogState, type Input, type Intent } from './dialog';
import type { ReplyBody } from './reply';

const ctx = { today: '2026-10-10' };
const intent = (name: Intent['name'], entities: Intent['entities'] = {}): Intent => ({
  name,
  entities,
});
const say = (t: string, i: Intent = intent('unknown')): Input => ({
  kind: 'text',
  text: t,
  intent: i,
});
const choose = (optionId: string): Input => ({ kind: 'choice', optionId });

const run = (state: DialogState, input: Input, fakes: Fakes = {}) =>
  drive(next(state, input, ctx), fakes);
const types = (replies: ReplyBody[]) => replies.map((r) => r.type);
const quickIds = (replies: ReplyBody[]) =>
  replies.flatMap((r) =>
    r.type === 'message.quick_replies' ? r.payload.options.map((o) => o.id) : [],
  );
const textOf = (replies: ReplyBody[]) =>
  replies.flatMap((r) => (r.type === 'message.text' ? [r.payload.text] : [])).join(' ');

describe('global entry points', () => {
  it.each(['greeting', 'help', 'cancel'] as const)(
    '%s shows the menu and resets the state',
    (name) => {
      const { final } = run({ name: 'claim.awaiting_cpf' }, say('x', intent(name)));
      expect(final.state).toEqual(IDLE);
      expect(quickIds(final.replies)).toEqual(['menu.quote', 'menu.policies', 'menu.claim']);
    },
  );

  it('the menu button also resets the state', () => {
    const { final } = run({ name: 'quote.awaiting_flow' }, choose('menu'));
    expect(final.state).toEqual(IDLE);
    expect(quickIds(final.replies)).toContain('menu.quote');
  });

  it('answers a voice message and keeps the state', () => {
    const state: DialogState = { name: 'policies.awaiting_cpf' };
    const { final } = run(state, { kind: 'voice', durationMs: 3000 });
    expect(final.state).toEqual(state);
    expect(textOf(final.replies)).toContain('áudio');
  });

  it('answers the branch location', () => {
    const { final } = run(IDLE, say('onde fica a agência', intent('location')));
    expect(types(final.replies)).toEqual(['message.text', 'message.location']);
    expect(final.state).toEqual(IDLE);
  });

  it('unknown text in idle shows the unknown reply', () => {
    const { final } = run(IDLE, say('blablabla'));
    expect(textOf(final.replies)).toContain('Não entendi');
    expect(final.state).toEqual(IDLE);
  });
});

describe('quote journey', () => {
  it('menu.quote and the quote intent send the Flow and wait for it', () => {
    for (const input of [choose('menu.quote'), say('quero cotar', intent('quote'))]) {
      const { final } = run(IDLE, input);
      expect(types(final.replies)).toEqual(['message.flow']);
      expect(final.state).toEqual({ name: 'quote.awaiting_flow' });
    }
  });

  it('turns a completed Flow into a quote request and replies with the quote', () => {
    const data = {
      produto: 'VIDA',
      nome: 'Maria Souza',
      cpf: '123.456.789-01',
      nascimento: '1990-05-20',
      capital: '200000',
    };
    const { final, calls } = run(
      { name: 'quote.awaiting_flow' },
      { kind: 'flow_submit', flowId: 'cotacao', data },
      { createQuote: ok(aQuote({ produto: 'VIDA' })) },
    );
    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call?.op === 'createQuote' && call.request.dados).toEqual({
      capitalSeguradoCentavos: 20000000,
    });
    expect(call?.op === 'createQuote' && call.request.cliente.cpf).toBe('12345678901');
    expect(types(final.replies)).toEqual(['message.template', 'message.carousel']);
    expect(final.state).toEqual(IDLE);
  });

  it('asks for the Flow again when the submitted data is invalid, without calling a service', () => {
    const { final, calls } = run(
      { name: 'quote.awaiting_flow' },
      { kind: 'flow_submit', flowId: 'cotacao', data: { produto: 'VIDA', nome: 'x' } },
    );
    expect(calls).toHaveLength(0);
    expect(types(final.replies)).toEqual(['message.text', 'message.flow']);
    expect(final.state).toEqual({ name: 'quote.awaiting_flow' });
  });

  it('ignores a Flow submission with another flow id', () => {
    const { final, calls } = run(
      { name: 'quote.awaiting_flow' },
      { kind: 'flow_submit', flowId: 'outro', data: {} },
    );
    expect(calls).toHaveLength(0);
    expect(types(final.replies)).toContain('message.flow');
  });

  it('re-sends the Flow when the user types while the Flow is pending', () => {
    const { final } = run({ name: 'quote.awaiting_flow' }, say('oi?'));
    expect(types(final.replies)).toEqual(['message.flow']);
    expect(final.state).toEqual({ name: 'quote.awaiting_flow' });
  });

  it('keeps waiting for the Flow when the quote service is unavailable', () => {
    const data = {
      produto: 'VIDA',
      nome: 'Maria Souza',
      cpf: '12345678901',
      nascimento: '1990-05-20',
      capital: '1000',
    };
    const { final } = run(
      { name: 'quote.awaiting_flow' },
      { kind: 'flow_submit', flowId: 'cotacao', data },
      { createQuote: err('unavailable') },
    );
    expect(textOf(final.replies)).toContain('Tente novamente');
    expect(types(final.replies)).toEqual(['message.text', 'message.flow']);
    expect(final.state).toEqual({ name: 'quote.awaiting_flow' });
  });

  it('keeps waiting for the Flow and re-sends it when the quote service rejects the data', () => {
    const data = {
      produto: 'VIDA',
      nome: 'Maria Souza',
      cpf: '12345678901',
      nascimento: '1990-05-20',
      capital: '1000',
    };
    const { final } = run(
      { name: 'quote.awaiting_flow' },
      { kind: 'flow_submit', flowId: 'cotacao', data },
      { createQuote: err('invalid') },
    );
    expect(types(final.replies)).toEqual(['message.text', 'message.flow']);
    expect(final.state).toEqual({ name: 'quote.awaiting_flow' });
  });

  describe('a Flow submitted outside quote.awaiting_flow', () => {
    const data = {
      produto: 'VIDA',
      nome: 'Maria Souza',
      cpf: '12345678901',
      nascimento: '1990-05-20',
      capital: '1000',
    };
    const elsewhere: DialogState[] = [
      IDLE,
      { name: 'policies.awaiting_cpf' },
      { name: 'claim.awaiting_description', apolice: 'AP-1001', tipo: 'COLISAO' },
    ];

    it.each(elsewhere)('builds the quote call from $name', (state) => {
      const { final, calls } = run(
        state,
        { kind: 'flow_submit', flowId: 'cotacao', data },
        { createQuote: ok(aQuote({ produto: 'VIDA' })) },
      );
      expect(calls.map((c) => c.op)).toEqual(['createQuote']);
      expect(types(final.replies)).toEqual(['message.template', 'message.carousel']);
      expect(final.state).toEqual(IDLE);
    });

    it('asks for the Flow again when the data is invalid', () => {
      const { final, calls } = run(IDLE, {
        kind: 'flow_submit',
        flowId: 'cotacao',
        data: { produto: 'VIDA' },
      });
      expect(calls).toHaveLength(0);
      expect(types(final.replies)).toEqual(['message.text', 'message.flow']);
      expect(final.state).toEqual({ name: 'quote.awaiting_flow' });
    });

    it('enters quote.awaiting_flow and re-sends the Flow when the service is unavailable', () => {
      const { final } = run(
        { name: 'policies.awaiting_cpf' },
        { kind: 'flow_submit', flowId: 'cotacao', data },
        { createQuote: err('unavailable') },
      );
      expect(types(final.replies)).toEqual(['message.text', 'message.flow']);
      expect(final.state).toEqual({ name: 'quote.awaiting_flow' });
    });

    it('a Flow with another id still reprompts for the current state', () => {
      const state: DialogState = { name: 'policies.awaiting_cpf' };
      const { final, calls } = run(state, { kind: 'flow_submit', flowId: 'outro', data });
      expect(calls).toHaveLength(0);
      expect(final.state).toEqual(state);
      expect(textOf(final.replies)).toContain('CPF');
    });
  });
});

describe('policies journey', () => {
  it('asks for the cpf, then lists the policies as choices', () => {
    const ask = run(IDLE, choose('menu.policies'));
    expect(ask.final.state).toEqual({ name: 'policies.awaiting_cpf' });

    const { final, calls } = run(ask.final.state, say('123.456.789-01'), {
      listPolicies: ok([
        aPolicySummary(),
        aPolicySummary({ numero: 'AP-1002', status: 'VENCIDA' }),
      ]),
    });
    expect(calls[0]?.op === 'listPolicies' && calls[0].cpf).toBe('12345678901');
    expect(quickIds(final.replies)).toEqual(['policy:AP-1001', 'policy:AP-1002']);
    expect(final.state).toEqual({
      name: 'policies.awaiting_choice',
      numeros: ['AP-1001', 'AP-1002'],
    });
  });

  it('goes straight to the list when the intent carries a cpf', () => {
    const { calls } = run(
      IDLE,
      say('minhas apólices 12345678901', intent('policies', { cpf: '12345678901' })),
      {
        listPolicies: ok([]),
      },
    );
    expect(calls[0]?.op).toBe('listPolicies');
  });

  it('goes straight to the policy when the intent carries a policy number', () => {
    const { final, calls } = run(
      IDLE,
      say('apólice AP-1001', intent('policies', { apolice: 'AP-1001' })),
      {
        getPolicy: ok(aPolicy()),
      },
    );
    expect(calls[0]?.op === 'getPolicy' && calls[0].numero).toBe('AP-1001');
    expect(types(final.replies)).toEqual(['message.template']);
  });

  it('reprompts for an invalid cpf and keeps the state', () => {
    const state: DialogState = { name: 'policies.awaiting_cpf' };
    const { final, calls } = run(state, say('123'));
    expect(calls).toHaveLength(0);
    expect(textOf(final.replies)).toContain('CPF');
    expect(final.state).toEqual(state);
  });

  it('says there are no policies for an empty list', () => {
    const { final } = run({ name: 'policies.awaiting_cpf' }, say('12345678901'), {
      listPolicies: ok([]),
    });
    expect(textOf(final.replies)).toContain('Não encontrei apólices');
    expect(final.state).toEqual(IDLE);
  });

  it('shows at most three policies', () => {
    const many = ['AP-1001', 'AP-1002', 'AP-1003', 'AP-1004'].map((numero) =>
      aPolicySummary({ numero }),
    );
    const { final } = run({ name: 'policies.awaiting_cpf' }, say('12345678901'), {
      listPolicies: ok(many),
    });
    expect(quickIds(final.replies)).toHaveLength(3);
    expect(final.state).toEqual({
      name: 'policies.awaiting_choice',
      numeros: ['AP-1001', 'AP-1002', 'AP-1003'],
    });
  });

  it('shows the detail of the chosen policy', () => {
    const { final, calls } = run(
      { name: 'policies.awaiting_choice', numeros: ['AP-1001'] },
      choose('policy:AP-1001'),
      {
        getPolicy: ok(aPolicy()),
      },
    );
    expect(calls[0]?.op === 'getPolicy' && calls[0].numero).toBe('AP-1001');
    expect(types(final.replies)).toEqual(['message.template']);
  });

  it('still honours a stale policy button in any state', () => {
    const { calls } = run({ name: 'quote.awaiting_flow' }, choose('policy:AP-1002'), {
      getPolicy: ok(aPolicy()),
    });
    expect(calls[0]?.op).toBe('getPolicy');
  });

  it('generates the second copy', () => {
    const { final, calls } = run(IDLE, choose('policy.second_copy:AP-1001'), {
      secondCopy: ok(aSecondCopy()),
    });
    expect(calls[0]?.op === 'secondCopy' && calls[0].numero).toBe('AP-1001');
    expect(
      final.replies[0]?.type === 'message.template' && final.replies[0].payload.buttons[0]?.type,
    ).toBe('url');
  });

  it('explains a second copy refusal (conflict) without a stack of details', () => {
    const { final } = run(IDLE, choose('policy.second_copy:AP-1003'), {
      secondCopy: err('conflict'),
    });
    expect(textOf(final.replies)).toContain('cancelada');
  });

  it('says a policy was not found', () => {
    const { final } = run(IDLE, choose('policy:AP-9999'), { getPolicy: err('not_found') });
    expect(textOf(final.replies)).toContain('Não encontrei essa apólice');
  });

  it('keeps the state and apologizes when the service is unavailable', () => {
    const state: DialogState = { name: 'policies.awaiting_cpf' };
    const { final } = run(state, say('12345678901'), { listPolicies: err('unavailable') });
    expect(textOf(final.replies)).toContain('Tente novamente');
    expect(final.state).toEqual(state);
  });
});

describe('claim journey', () => {
  const active = aPolicySummary();

  it('asks for the cpf, then jumps to the type when there is a single active policy', () => {
    const ask = run(IDLE, choose('menu.claim'));
    expect(ask.final.state).toEqual({ name: 'claim.awaiting_cpf' });
    const { final } = run(ask.final.state, say('12345678901'), {
      listPolicies: ok([active, aPolicySummary({ numero: 'AP-1002', status: 'VENCIDA' })]),
    });
    expect(final.state).toEqual({ name: 'claim.awaiting_type', apolice: 'AP-1001' });
    expect(quickIds(final.replies)).toEqual([
      'claim.type:COLISAO',
      'claim.type:ROUBO',
      'claim.type:OUTROS',
    ]);
  });

  it('lets the user choose when there are several active policies', () => {
    const { final } = run({ name: 'claim.awaiting_cpf' }, say('12345678901'), {
      listPolicies: ok([active, aPolicySummary({ numero: 'AP-1005' })]),
    });
    expect(quickIds(final.replies)).toEqual(['claimpolicy:AP-1001', 'claimpolicy:AP-1005']);
    expect(final.state).toEqual({ name: 'claim.awaiting_policy', numeros: ['AP-1001', 'AP-1005'] });
  });

  it('refuses when there is no active policy', () => {
    const { final } = run({ name: 'claim.awaiting_cpf' }, say('12345678901'), {
      listPolicies: ok([aPolicySummary({ status: 'CANCELADA' })]),
    });
    expect(textOf(final.replies)).toContain('ativas');
    expect(final.state).toEqual(IDLE);
  });

  it('picks the policy by button or by typing its number', () => {
    const state: DialogState = { name: 'claim.awaiting_policy', numeros: ['AP-1001', 'AP-1005'] };
    expect(run(state, choose('claimpolicy:AP-1005')).final.state).toEqual({
      name: 'claim.awaiting_type',
      apolice: 'AP-1005',
    });
    expect(
      run(state, say('AP-1001', intent('unknown', { apolice: 'AP-1001' }))).final.state,
    ).toEqual({
      name: 'claim.awaiting_type',
      apolice: 'AP-1001',
    });
    expect(
      run(state, say('AP-9999', intent('unknown', { apolice: 'AP-9999' }))).final.state,
    ).toEqual(state);
  });

  it('starts from a policy detail button', () => {
    const { final } = run(IDLE, choose('policy.claim:AP-1001'));
    expect(final.state).toEqual({ name: 'claim.awaiting_type', apolice: 'AP-1001' });
  });

  it('asks for the description after the type is chosen and rejects other types', () => {
    const state: DialogState = { name: 'claim.awaiting_type', apolice: 'AP-1001' };
    expect(run(state, choose('claim.type:COLISAO')).final.state).toEqual({
      name: 'claim.awaiting_description',
      apolice: 'AP-1001',
      tipo: 'COLISAO',
    });
    expect(run(state, choose('claim.type:INCENDIO')).final.state).toEqual(state);
    expect(run(state, say('qualquer coisa')).final.state).toEqual(state);
  });

  it('opens the claim with today as the occurrence date and replies with the protocol', () => {
    const state: DialogState = {
      name: 'claim.awaiting_description',
      apolice: 'AP-1001',
      tipo: 'COLISAO',
    };
    const { final, calls } = run(state, say('Bati no portão da garagem.'), {
      openClaim: ok(aClaimOpened()),
    });
    expect(calls[0]?.op === 'openClaim' && calls[0].request).toEqual({
      apoliceNumero: 'AP-1001',
      tipo: 'COLISAO',
      dataOcorrencia: '2026-10-10',
      descricao: 'Bati no portão da garagem.',
    });
    expect(types(final.replies)).toEqual(['message.text', 'message.code', 'message.quick_replies']);
    expect(final.state).toEqual(IDLE);
  });

  it('does not restart the journey when the description looks like an intent', () => {
    const state: DialogState = {
      name: 'claim.awaiting_description',
      apolice: 'AP-1001',
      tipo: 'COLISAO',
    };
    const { final, calls } = run(
      state,
      say('bati o carro, colisão no estacionamento', intent('claim')),
      {
        openClaim: ok(aClaimOpened()),
      },
    );
    expect(calls[0]?.op).toBe('openClaim');
    expect(types(final.replies)).toContain('message.code');
  });

  it('lets the user cancel while writing the description', () => {
    const state: DialogState = {
      name: 'claim.awaiting_description',
      apolice: 'AP-1001',
      tipo: 'COLISAO',
    };
    const { final, calls } = run(state, say('cancelar', intent('cancel')));
    expect(calls).toHaveLength(0);
    expect(final.state).toEqual(IDLE);
  });

  it('ignores the intent of a description that is not exactly "cancelar"', () => {
    const state: DialogState = {
      name: 'claim.awaiting_description',
      apolice: 'AP-1001',
      tipo: 'COLISAO',
    };
    const { calls } = run(state, say('tive que sair da pista', intent('cancel')), {
      openClaim: ok(aClaimOpened()),
    });
    expect(calls[0]?.op === 'openClaim' && calls[0].request.descricao).toBe(
      'tive que sair da pista',
    );
  });

  it('rejects a description above 1000 characters without calling the service', () => {
    const state: DialogState = {
      name: 'claim.awaiting_description',
      apolice: 'AP-1001',
      tipo: 'COLISAO',
    };
    const { final, calls } = run(state, say('a'.repeat(1001)));
    expect(calls).toHaveLength(0);
    expect(final.state).toEqual(state);
  });

  it('maps the failures of opening a claim and keeps the description state when unavailable', () => {
    const state: DialogState = {
      name: 'claim.awaiting_description',
      apolice: 'AP-1001',
      tipo: 'COLISAO',
    };
    expect(
      textOf(run(state, say('texto'), { openClaim: err('conflict') }).final.replies),
    ).toContain('não está ativa');
    expect(run(state, say('texto'), { openClaim: err('conflict') }).final.state).toEqual(IDLE);
    const down = run(state, say('texto'), { openClaim: err('unavailable') });
    expect(textOf(down.final.replies)).toContain('Tente novamente');
    expect(down.final.state).toEqual(state);
  });
});

describe('claim status', () => {
  it('asks for the protocol and then shows the claim', () => {
    const ask = run(IDLE, say('status do sinistro', intent('claim_status')));
    expect(ask.final.state).toEqual({ name: 'claim_status.awaiting_protocol' });
    const { final, calls } = run(ask.final.state, say('sn-2001'), { getClaim: ok(aClaim()) });
    expect(calls[0]?.op === 'getClaim' && calls[0].protocolo).toBe('SN-2001');
    expect(types(final.replies)).toEqual(['message.template']);
    expect(final.state).toEqual(IDLE);
  });

  it('goes straight to the claim when the intent carries the protocol', () => {
    const { calls } = run(
      IDLE,
      say('sinistro SN-2001', intent('claim_status', { protocolo: 'SN-2001' })),
      {
        getClaim: ok(aClaim()),
      },
    );
    expect(calls[0]?.op).toBe('getClaim');
  });

  it('reprompts for an invalid protocol and never builds a call from it', () => {
    const state: DialogState = { name: 'claim_status.awaiting_protocol' };
    const { final, calls } = run(state, say('SN-1/../../etc'));
    expect(calls).toHaveLength(0);
    expect(final.state).toEqual(state);
  });

  it('says the claim was not found', () => {
    const { final } = run({ name: 'claim_status.awaiting_protocol' }, say('SN-9999'), {
      getClaim: err('not_found'),
    });
    expect(textOf(final.replies)).toContain('Não encontrei esse sinistro');
  });
});

describe('hostile identifiers', () => {
  it.each([
    'policy:AP-1/../../x',
    'policy:AP-1001%2F..',
    'policy:',
    'policy:../AP-1001',
    'policy.second_copy:x y',
  ])('never builds a service call from the button id %j', (id) => {
    const { final, calls } = run(IDLE, choose(id));
    expect(calls).toHaveLength(0);
    expect(final.state).toEqual(IDLE);
  });

  it('never builds a call from a policy number or cpf that does not match the format', () => {
    const state: DialogState = { name: 'claim.awaiting_policy', numeros: ['AP-1001'] };
    expect(run(state, choose('claimpolicy:AP-1001/../x')).calls).toHaveLength(0);
    expect(run({ name: 'policies.awaiting_cpf' }, say('1234567890a')).calls).toHaveLength(0);
  });
});

describe('cpf entity validation', () => {
  it.each(['1234567890a', '123/../x'])(
    'never calls a service with the bad cpf entity %j',
    (cpf) => {
      for (const name of ['policies', 'claim'] as const) {
        const { final, calls } = run(IDLE, say('x', intent(name, { cpf })));
        expect(calls).toHaveLength(0);
        expect(final.state).toEqual({
          name: name === 'policies' ? 'policies.awaiting_cpf' : 'claim.awaiting_cpf',
        });
      }
    },
  );

  it('a bad entity does not hide a valid cpf typed in the text', () => {
    const { calls } = run(
      { name: 'policies.awaiting_cpf' },
      say('12345678901', intent('unknown', { cpf: 'bad' })),
      {
        listPolicies: ok([]),
      },
    );
    expect(calls[0]?.op === 'listPolicies' && calls[0].cpf).toBe('12345678901');
  });

  it('reprompts when both the entity and the text are invalid', () => {
    const { final, calls } = run(
      { name: 'claim.awaiting_cpf' },
      say('zzz', intent('unknown', { cpf: 'bad' })),
    );
    expect(calls).toHaveLength(0);
    expect(textOf(final.replies)).toContain('CPF');
  });
});

describe('unavailable keeps the step', () => {
  it('getClaim', () => {
    const state: DialogState = { name: 'claim_status.awaiting_protocol' };
    const down = run(state, say('SN-2001'), { getClaim: err('unavailable') });
    expect(textOf(down.final.replies)).toContain('Tente novamente');
    expect(down.final.state).toEqual(state);
    const again = run(down.final.state, say('SN-2001'), { getClaim: ok(aClaim()) });
    expect(types(again.final.replies)).toEqual(['message.template']);
  });

  it('getPolicy', () => {
    const state: DialogState = { name: 'policies.awaiting_choice', numeros: ['AP-1001'] };
    expect(
      run(state, choose('policy:AP-1001'), { getPolicy: err('unavailable') }).final.state,
    ).toEqual(state);
  });

  it('secondCopy', () => {
    const state: DialogState = { name: 'policies.awaiting_choice', numeros: ['AP-1001'] };
    const { final } = run(state, choose('policy.second_copy:AP-1001'), {
      secondCopy: err('unavailable'),
    });
    expect(final.state).toEqual(state);
  });

  it('listPolicies from the claim cpf step', () => {
    const state: DialogState = { name: 'claim.awaiting_cpf' };
    expect(
      run(state, say('12345678901'), { listPolicies: err('unavailable') }).final.state,
    ).toEqual(state);
  });

  it('not_found still resets to idle', () => {
    const state: DialogState = { name: 'policies.awaiting_choice', numeros: ['AP-1001'] };
    expect(
      run(state, choose('policy:AP-1001'), { getPolicy: err('not_found') }).final.state,
    ).toEqual(IDLE);
  });
});

describe('list choices are constrained', () => {
  it('policy button outside the offered list', () => {
    const state: DialogState = { name: 'policies.awaiting_choice', numeros: ['AP-1001'] };
    const { final, calls } = run(state, choose('policy:AP-1234'));
    expect(calls).toHaveLength(0);
    expect(final.state).toEqual(state);
  });

  it('claimpolicy button outside the offered list', () => {
    const state: DialogState = { name: 'claim.awaiting_policy', numeros: ['AP-1001'] };
    const { final, calls } = run(state, choose('claimpolicy:AP-1234'));
    expect(calls).toHaveLength(0);
    expect(final.state).toEqual(state);
  });

  it('the listed number still works', () => {
    const state: DialogState = { name: 'claim.awaiting_policy', numeros: ['AP-1001'] };
    expect(run(state, choose('claimpolicy:AP-1001')).final.state).toEqual({
      name: 'claim.awaiting_type',
      apolice: 'AP-1001',
    });
  });

  it('upper-cases a typed policy number', () => {
    const state: DialogState = { name: 'claim.awaiting_policy', numeros: ['AP-1001'] };
    const { final } = run(state, say('ap-1001', intent('unknown', { apolice: 'ap-1001' })));
    expect(final.state).toEqual({ name: 'claim.awaiting_type', apolice: 'AP-1001' });
  });
});
