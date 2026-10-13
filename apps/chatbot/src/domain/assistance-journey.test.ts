import { describe, expect, it } from 'vitest';
import { assistanceCatalog } from './assistance-catalog';
import { nextAssistanceState } from './assistance-journey';

describe('assistance journey transitions', () => {
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
    expect(accepted.step.behavior).toBe('Apenas o formato do CPF foi aceito; nenhuma verificação de identidade foi realizada.');
    expect(accepted.state).toEqual({ journeyId: 'IDE', screenId: 'IDE-03', gateApproved: true });
    expect(JSON.stringify(accepted)).not.toContain('12345678900');

    const personal = nextAssistanceState(accepted.state, { type: 'open', target: 'CON-02' });
    expect(personal.step.id).toBe('CON-02');
    expect(personal.state).toEqual({ journeyId: 'CON', screenId: 'CON-02', gateApproved: true });
  });

  it('keeps an invalid CPF gate closed and blocks a subsequent personal target', () => {
    const rejected = nextAssistanceState(
      { journeyId: 'IDE', screenId: 'IDE-08', gateApproved: false },
      { type: 'cpf_submit', cpf: '1234' },
    );
    expect(rejected.step.id).toBe('IDE-04');
    expect(rejected.state).toEqual({ journeyId: 'IDE', screenId: 'IDE-04', gateApproved: false });

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
      const flow = step.flow as {
        title?: string;
        fields?: Array<{ label?: string; placeholder?: string }>;
        submit?: string;
        note?: string;
      } | undefined;
      const customerText = [
        step.title,
        step.bot,
        ...step.actions.map(({ label }) => label),
        flow?.title,
        ...(flow?.fields ?? []).flatMap((field) => [field.label, field.placeholder]),
        flow?.submit,
        flow?.note,
      ].filter((value): value is string => typeof value === 'string').join(' ');

      expect(step.id).toBe(id);
      expect(customerText).not.toMatch(forbidden);
    }
  });
});
