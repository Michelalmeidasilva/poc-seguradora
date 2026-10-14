import { describe, expect, it } from 'vitest';
import { assistanceCatalog } from './assistance-catalog';
import { nextAssistanceState } from './assistance-journey';

describe('assistance journey transitions', () => {
  it.each(['IDE-01', 'IDE-02', 'IDE-04', 'IDE-05', 'IDE-06', 'IDE-08'])('accepts a whole trimmed CPF from %s without storing it', (screenId) => {
    const next = nextAssistanceState({ journeyId: 'IDE', screenId, gateApproved: false }, { type: 'cpf_submit', cpf: ' \t000.000.000-00\n' });
    expect(next.state).toEqual({ journeyId: 'IDE', screenId: 'IDE-03', gateApproved: true });
    expect(JSON.stringify(next.state)).not.toContain('000');
  });
  it('blocks personal entry until the CPF format gate is approved', () => {
    const next = nextAssistanceState(
      { journeyId: 'CON', screenId: 'CON-01', gateApproved: false },
      { type: 'open', target: 'CON-01' },
    );
    expect(next.step.id).toBe('IDE-01');
    expect(next.state).toEqual({ journeyId: 'IDE', screenId: 'IDE-01', gateApproved: false });
  });

  it('allows public product discovery without CPF', () => {
    const next = nextAssistanceState(
      { journeyId: 'ENT', screenId: 'ENT-02', gateApproved: false },
      { type: 'quick_reply', target: 'DES-01', offeredFrom: 'ENT-02' },
    );
    expect(next.step.id).toBe('DES-01');
    expect(next.state).toEqual({ journeyId: 'DES', screenId: 'DES-01', gateApproved: false });
  });

  it('accepts an offered quick reply and rejects one from a stale screen', () => {
    const state = { journeyId: 'ENT', screenId: 'ENT-02', gateApproved: false };
    expect(nextAssistanceState(state, {
      type: 'quick_reply', target: 'DES-01', offeredFrom: 'ENT-02',
    }).step.id).toBe('DES-01');
    expect(nextAssistanceState(state, {
      type: 'quick_reply', target: 'IDE-03', offeredFrom: 'IDE-02',
    })).toEqual({
      step: assistanceCatalog.byId['ENT-02'],
      state,
    });
  });

  it('rejects unknown and LEG destinations without changing the current step', () => {
    const state = { journeyId: 'ENT', screenId: 'ENT-02', gateApproved: false };
    expect(nextAssistanceState(state, { type: 'open', target: 'missing' })).toEqual({
      step: assistanceCatalog.byId['ENT-02'], state,
    });
    expect(nextAssistanceState(state, { type: 'open', target: 'LEG-001' })).toEqual({
      step: assistanceCatalog.byId['ENT-02'], state,
    });
  });

  it('approves the CPF format gate and unlocks a personal target without retaining the CPF', () => {
    const state = { journeyId: 'IDE', screenId: 'IDE-08', gateApproved: false };
    const accepted = nextAssistanceState(state, { type: 'cpf_submit', cpf: '123.456.789-00' });

    expect(accepted.step.id).toBe('IDE-03');
    expect(accepted.step.behavior).toBe('O formato do CPF foi aceito. Os dados seguintes pertencem a um cenário fictício.');
    expect(accepted.state).toEqual({ journeyId: 'IDE', screenId: 'IDE-03', gateApproved: true });
    expect(JSON.stringify(accepted)).not.toContain('12345678900');

    const personal = nextAssistanceState(accepted.state, { type: 'open', target: 'CON-02' });
    expect(personal.step.id).toBe('CON-02');
    expect(personal.state).toEqual({ journeyId: 'CON', screenId: 'CON-02', gateApproved: true });
  });

  it('keeps an invalid CPF gate closed and blocks a subsequent personal target', () => {
    const rejected = nextAssistanceState(
      { journeyId: 'IDE', screenId: 'IDE-08', gateApproved: false },
      { type: 'cpf_submit', cpf: '9876543210' },
    );
    expect(rejected.step.id).toBe('IDE-04');
    expect(rejected.state).toEqual({ journeyId: 'IDE', screenId: 'IDE-04', gateApproved: false });
    expect(JSON.stringify(rejected)).not.toContain('9876543210');

    const personal = nextAssistanceState(rejected.state, { type: 'open', target: 'CON-02' });
    expect(personal.step.id).toBe('IDE-01');
    expect(personal.state).toEqual({ journeyId: 'IDE', screenId: 'IDE-01', gateApproved: false });
  });

  it('keeps customer-facing IDE copy and Flow fields free of codes and identity-verification claims', () => {
    const forbidden = /\b(?:otp|c[oó]digo)\b|identidade\s+(?:verificada|confirmada)|titular\s+identificado/i;
    const ideIds = ['IDE-01', 'IDE-02', 'IDE-03', 'IDE-04', 'IDE-05', 'IDE-06', 'IDE-07', 'IDE-08'];

    for (const id of ideIds) {
      const transition = nextAssistanceState(
        { journeyId: 'IDE', screenId: 'IDE-01', gateApproved: false },
        { type: 'open', target: id },
      );
      const step = transition.step;
      const customerText = [
        step.title,
        step.user,
        step.bot,
        step.behavior,
        ...step.actions.map(({ label }) => label),
        JSON.stringify(step.flow ?? null),
      ].join(' ');

      expect(step.id).toBe(id);
      expect(customerText).not.toMatch(forbidden);
    }
  });
});
