import { ok } from '@seguradora/protocol';
import { describe, expect, it } from 'vitest';
import { IDLE, next, type DialogState } from '../domain/dialog';
import { drive, type Fakes } from '../test/drive';
import { aClaimOpened, aPolicy } from '../test/fixtures';
import { MockLlmProvider } from './mock-llm-provider';

/**
 * Dialog tests that classify the typed text with the real mock LLM (instead of hand-made
 * intents), so keyword rules that collide with a step's expected input are caught.
 */
const llm = new MockLlmProvider();
const ctx = { today: '2026-10-10' };

const typed = async (state: DialogState, text: string, fakes: Fakes = {}) =>
  drive(next(state, { kind: 'text', text, intent: await llm.classify(text) }, ctx), fakes);

const describing: DialogState = {
  name: 'claim.awaiting_description',
  apolice: 'AP-1001',
  tipo: 'COLISAO',
};

describe('claim description with the real classifier', () => {
  it.each([
    'Ao voltar do trabalho bati o carro no poste',
    'Tive que sair da pista e bati',
    'Preciso sair daqui e parar o carro, depois voltar',
  ])('accepts %j as the description', async (text) => {
    const { calls } = await typed(describing, text, { openClaim: ok(aClaimOpened()) });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.op === 'openClaim' && calls[0].request.descricao).toBe(text);
  });

  it.each(['cancelar', '  Cancelar ', 'CANCELAR', 'cancela'])('%j cancels', async (text) => {
    const { final, calls } = await typed(describing, text);
    expect(calls).toHaveLength(0);
    expect(final.state).toEqual(IDLE);
  });
});

describe('typed policy numbers at a list prompt', () => {
  const numeros = ['AP-1001', 'AP-1005'];

  it.each(['AP-1001', 'ap1001', 'a apólice AP-1001'])(
    '%j selects the policy for the claim',
    async (text) => {
      const { final, calls } = await typed({ name: 'claim.awaiting_policy', numeros }, text);
      expect(calls).toHaveLength(0);
      expect(final.state).toEqual({ name: 'claim.awaiting_type', apolice: 'AP-1001' });
    },
  );

  it.each(['AP-1001', 'ap1001', 'a apólice AP-1001'])(
    '%j views the listed policy',
    async (text) => {
      const { calls } = await typed({ name: 'policies.awaiting_choice', numeros }, text, {
        getPolicy: ok(aPolicy()),
      });
      expect(calls.map((c) => c.op === 'getPolicy' && c.numero)).toEqual(['AP-1001']);
    },
  );

  it('a number outside the list keeps the global behaviour (shows that policy)', async () => {
    const { calls } = await typed({ name: 'claim.awaiting_policy', numeros }, 'AP-2002', {
      getPolicy: ok(aPolicy({ numero: 'AP-2002' })),
    });
    expect(calls.map((c) => c.op === 'getPolicy' && c.numero)).toEqual(['AP-2002']);
  });
});

describe('typed claim type', () => {
  const choosing: DialogState = { name: 'claim.awaiting_type', apolice: 'AP-1001' };

  it.each([
    ['colisão', 'COLISAO'],
    ['Roubo', 'ROUBO'],
    ['foi um furto', 'ROUBO'],
    ['outros', 'OUTROS'],
  ] as const)('%j goes to the description as %s', async (text, tipo) => {
    const { final, calls } = await typed(choosing, text);
    expect(calls).toHaveLength(0);
    expect(final.state).toEqual({ name: 'claim.awaiting_description', apolice: 'AP-1001', tipo });
  });

  it('reprompts for an unrecognized type', async () => {
    const { final } = await typed(choosing, 'banana');
    expect(final.state).toEqual(choosing);
    expect(final.replies.some((r) => r.type === 'message.quick_replies')).toBe(true);
  });

  it('"cancelar" cancels', async () => {
    const { final } = await typed(choosing, 'cancelar');
    expect(final.state).toEqual(IDLE);
  });
});
