import { describe, expect, it } from 'vitest';
import { nextAssistanceState } from './assistance-journey';

describe('assistance journey transitions', () => {
  it('blocks personal entry until the CPF format gate is approved', () => {
    const next = nextAssistanceState(
      { journeyId: 'CON', screenId: 'CON-01', gateApproved: false },
      { type: 'open', target: 'CON-01' },
    );
    expect(next.id).toBe('IDE-01');
  });

  it('allows public product discovery without CPF', () => {
    const next = nextAssistanceState(
      { journeyId: 'ENT', screenId: 'ENT-02', gateApproved: false },
      { type: 'quick_reply', target: 'DES-01', offeredFrom: 'ENT-02' },
    );
    expect(next.id).toBe('DES-01');
  });

  it('accepts an offered quick reply and rejects one from a stale screen', () => {
    const state = { journeyId: 'ENT', screenId: 'ENT-02', gateApproved: false };
    expect(nextAssistanceState(state, {
      type: 'quick_reply', target: 'DES-01', offeredFrom: 'ENT-02',
    }).id).toBe('DES-01');
    expect(nextAssistanceState(state, {
      type: 'quick_reply', target: 'IDE-03', offeredFrom: 'IDE-02',
    }).id).toBe('ENT-02');
  });

  it('rejects unknown and LEG destinations without changing the current step', () => {
    const state = { journeyId: 'ENT', screenId: 'ENT-02', gateApproved: false };
    expect(nextAssistanceState(state, { type: 'open', target: 'missing' }).id).toBe('ENT-02');
    expect(nextAssistanceState(state, { type: 'open', target: 'LEG-001' }).id).toBe('ENT-02');
  });

  it('routes valid CPF format to the CPF-only accepted screen and malformed input to correction', () => {
    const state = { journeyId: 'IDE', screenId: 'IDE-08', gateApproved: false };
    expect(nextAssistanceState(state, { type: 'cpf_submit', cpf: '123.456.789-00' }).id).toBe('IDE-03');
    expect(nextAssistanceState(state, { type: 'cpf_submit', cpf: '1234' }).id).toBe('IDE-04');
  });

  it('does not expose raw CPF in returned transition state', () => {
    const next = nextAssistanceState(
      { journeyId: 'IDE', screenId: 'IDE-08', gateApproved: false },
      { type: 'cpf_submit', cpf: '12345678900' },
    );
    expect(JSON.stringify(next)).not.toContain('12345678900');
    expect(next.id).toBe('IDE-03');
  });
});
