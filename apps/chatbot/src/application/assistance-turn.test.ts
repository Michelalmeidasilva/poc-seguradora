import { UnsequencedServerEventSchema, ok } from '@seguradora/protocol';
import { describe, expect, it, vi } from 'vitest';
import { assistanceCatalog } from '../domain/assistance-catalog';
import type { AssistanceDocumentScreen } from './assistance-service';
import type { AssistancePort } from './ports';
import { runAssistanceTurn } from './assistance-turn';

const ctx = { correlationId: 'corr-demo', idempotencyKey: 'idem-demo' };
const state = { journeyId: 'DEP', screenId: 'DEP-06', gateApproved: true };
const snapshot = {
  demonstrative: true as const,
  contract: { status: 'active' as const, modality: 'familiar' as const, since: '2026-10-10' },
  dependents: [],
  benefits: [],
  documents: [{ id: 'DOC-ADESAO-DEMO', title: 'Termo demonstrativo de adesão', status: 'available' as const }],
  billing: { status: 'demonstrative' as const, reference: 'REF-DEMO-001', message: 'Demonstração' },
  preferences: { contactChannel: 'whatsapp' as const, email: 'cliente@example.test', paperless: true, optionalDocs: true, optionalBenefits: false },
  currentAddress: { postal: '01000-000', address: 'Rua Demonstrativa, 100', city: 'São Paulo/SP' },
  requests: [],
};
const port = (): AssistancePort => ({
  getSessionSnapshot: vi.fn(async () => ok(snapshot)), listBenefits: vi.fn(async () => ok([])),
  listDocuments: vi.fn(async (_sessionId: string, screenId: AssistanceDocumentScreen) => ok(({
    'CON-07': [
      { id: 'doc-adhesion', title: 'Termo de adesão', status: 'available' as const },
      { id: 'doc-conditions', title: 'Condições do produto', status: 'available' as const },
      { id: 'doc-proof', title: 'Comprovante de contratação', status: 'available' as const },
    ],
    'UTI-09': [{ id: 'doc-benefit', title: 'Identificação do benefício', status: 'available' as const }],
    'CAN-08': [{ id: 'doc-cancellation', title: 'Termo de cancelamento', status: 'available' as const }],
  })[screenId])), listDependents: vi.fn(async () => ok([])),
  addDependent: vi.fn(async () => ok({ id: 'd1', name: 'João', cpf: '12345678901', birthDate: '2010-01-01', relationship: 'filho', phone: '11999999999', biologicalSex: 'male' as const })),
  updateDependent: vi.fn(async () => ok({ id: 'd1', name: 'João', cpf: '12345678901', birthDate: '2010-01-01', relationship: 'filho', phone: '11999999999', biologicalSex: 'male' as const })),
  removeDependent: vi.fn(async () => ok(undefined)), changeModality: vi.fn(async () => ok(undefined)),
  renewAssistance: vi.fn(async () => ok({ id: 'r1', kind: 'renewal' as const, status: 'received' as const, message: 'Demonstração' })),
  cancelAssistance: vi.fn(async () => ok({ id: 'r1', kind: 'cancellation' as const, status: 'received' as const, message: 'Demonstração' })),
  updateAddress: vi.fn(async () => ok({ id: 'a1', kind: 'address_update' as const, status: 'received' as const, message: 'Demonstração' })),
  requestFuneralAssistance: vi.fn(async () => ok({ id: 'f1', kind: 'funeral_assistance' as const, status: 'received' as const, message: 'Demonstração' })),
  getBilling: vi.fn(async () => ok(snapshot.billing)), regularizeBilling: vi.fn(async () => ok(snapshot.billing)),
  getPreferences: vi.fn(async () => ok(snapshot.preferences)), updatePreferences: vi.fn(async (_sessionId, command) => ok(command.preferences)),
  listRequests: vi.fn(async () => ok([])), createRequest: vi.fn(async () => ok({ id: 'r1', kind: 'human_handoff' as const, status: 'received' as const, message: 'Demonstração' })),
  getRequest: vi.fn(async () => ok({ id: 'r1', kind: 'human_handoff' as const, status: 'received' as const, message: 'Demonstração' })),
});

describe('runAssistanceTurn', () => {
  it('serves the versioned catalog Flow and resolves a list choice to its catalog destination', async () => {
    const assistance = port();
    const opened = await runAssistanceTurn({ type: 'open', target: 'DES-01' }, {
      port: assistance, state: { journeyId: 'ENT', screenId: 'ENT-02', gateApproved: false }, sessionId: 'list', context: ctx,
    });
    expect(opened.ok && opened.value.replies[0]).toMatchObject({ type: 'message.flow', payload: { flowId: 'DES-01', flowJson: { version: '7.1', screens: expect.any(Array) } } });
    const chosen = await runAssistanceTurn({ type: 'flow_submit', flowId: 'DES-01', data: { choice: '2' } }, {
      port: assistance, state: { journeyId: 'DES', screenId: 'DES-01', gateApproved: false }, sessionId: 'list', context: ctx,
    });
    expect(chosen.ok && chosen.value.state.screenId).toBe('DES-14');
  });
  it('rejects an unselected catalog form option at the chatbot boundary', async () => {
    const result = await runAssistanceTurn({ type: 'flow_submit', flowId: 'DES-07', data: { composition: 'Selecione' } }, {
      port: port(), state: { journeyId: 'DES', screenId: 'DES-07', gateApproved: true }, sessionId: 'unselected', context: ctx,
    });
    expect(result.ok && result.value.state.screenId).toBe('DES-07');
  });
  it('routes a review correction without mutation and retains earlier form values', async () => {
    const assistance = port();
    const earlier = { postal: '01000-000', address: 'Rua A, 1', city: 'São Paulo/SP' };
    const result = await runAssistanceTurn({ type: 'flow_submit', flowId: 'CAD-03', data: { correction: true } }, {
      port: assistance, state: { journeyId: 'CAD', screenId: 'CAD-03', gateApproved: true, temporaryData: earlier }, sessionId: 'correction', context: ctx,
    });
    expect(result.ok && result.value.state.screenId).toBe('CAD-02');
    expect(result.ok && result.value.state.temporaryData).toEqual(earlier);
    expect(assistance.updateAddress).not.toHaveBeenCalled();
  });
  it('carries a safe draft through review, correction, and one terminal mutation', async () => {
    const assistance = port();
    const first = await runAssistanceTurn({ type: 'flow_submit', flowId: 'CAD-02', data: {
      postal: '01000-000', address: 'Rua A, 1', city: 'São Paulo/SP',
    } }, { port: assistance, state: { journeyId: 'CAD', screenId: 'CAD-02', gateApproved: true }, sessionId: 'draft', context: ctx });
    expect(first.ok && first.value.replies[0]).toMatchObject({ type: 'message.flow', payload: {
      flowId: 'CAD-03', initialData: { intent: 'review', values: { postal: '01000-000', address: 'Rua A, 1', city: 'São Paulo/SP' } },
    } });

    const correction = await runAssistanceTurn({ type: 'flow_submit', flowId: 'CAD-03', data: { correction: true } }, {
      port: assistance, state: first.ok ? first.value.state : state, sessionId: 'draft', context: ctx,
    });
    expect(correction.ok && correction.value.replies[0]).toMatchObject({ type: 'message.flow', payload: {
      flowId: 'CAD-02', initialData: { intent: 'correction', values: { postal: '01000-000', address: 'Rua A, 1', city: 'São Paulo/SP' } },
    } });
    const corrected = await runAssistanceTurn({ type: 'flow_submit', flowId: 'CAD-02', data: {
      postal: '01000-000', address: 'Rua B, 2', city: 'São Paulo/SP',
    } }, { port: assistance, state: correction.ok ? correction.value.state : state, sessionId: 'draft', context: ctx });
    expect(corrected.ok && corrected.value.replies[0]).toMatchObject({ type: 'message.flow', payload: {
      flowId: 'CAD-03', initialData: { intent: 'review', values: { postal: '01000-000', address: 'Rua B, 2', city: 'São Paulo/SP' } },
    } });
    expect(assistance.updateAddress).not.toHaveBeenCalled();
    const reviewedState = corrected.ok ? corrected.value.state : state;
    const confirmed = await runAssistanceTurn({ type: 'flow_submit', flowId: 'CAD-03', data: {} }, {
      port: assistance, state: reviewedState, sessionId: 'draft', context: ctx,
    });
    expect(confirmed.ok).toBe(true);
    expect(assistance.updateAddress).toHaveBeenCalledTimes(1);
    const duplicate = await runAssistanceTurn({ type: 'flow_submit', flowId: 'CAD-03', data: {} }, {
      port: assistance, state: confirmed.ok ? confirmed.value.state : state, sessionId: 'draft', context: ctx,
    });
    expect(duplicate.ok).toBe(true);
    expect(assistance.updateAddress).toHaveBeenCalledTimes(1);
  });
  it('masks CPF while showing ordinary values in cross-step review data', async () => {
    const canary = '98765432109';
    const result = await runAssistanceTurn({ type: 'flow_submit', flowId: 'DEP-05', data: {
      name: 'Ana Lima', birth: '2014-03-12', document: canary, relationship: 'Filha', phone: '11999999999', biologicalSex: 'Feminino',
    } }, {
      port: port(), state: { journeyId: 'DEP', screenId: 'DEP-05', gateApproved: true },
      sessionId: 'cpf-mask', context: ctx,
    });
    const serialized = JSON.stringify(result.ok ? result.value.replies : result);
    expect(serialized).not.toContain(canary);
    expect(serialized).toContain('•••••••••09');
    expect(serialized).toContain('Ana Lima');
  });
  it('does not hydrate a review Flow from a stale draft when it was not reached by form submit', async () => {
    const result = await runAssistanceTurn({ type: 'open', target: 'DEP-06' }, {
      port: port(), state: { journeyId: 'CAD', screenId: 'CAD-02', gateApproved: true,
        temporaryData: { name: 'Old journey', document: '98765432109' } },
      sessionId: 'stale-draft', context: ctx,
    });
    const flow = result.ok ? result.value.replies.find((reply) => reply.type === 'message.flow') : undefined;
    expect(flow?.type === 'message.flow' && flow.payload.initialData).toBeUndefined();
  });
  it('returns the domain transition state exactly and never retains the submitted gate CPF', async () => {
    const assistance = port();
    const result = await runAssistanceTurn({ type: 'cpf_submit', cpf: '123.456.789-01' }, {
      port: assistance, state: { journeyId: 'IDE', screenId: 'IDE-08', gateApproved: false }, sessionId: 's1', context: ctx,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.state).toEqual({ journeyId: 'IDE', screenId: 'IDE-03', gateApproved: true });
      expect(JSON.stringify(result.value.state)).not.toContain('12345678901');
    }
    expect(assistance.getSessionSnapshot).not.toHaveBeenCalled();
  });

  it('continues to the previously requested personal screen after a valid CPF gate', async () => {
    const result = await runAssistanceTurn({ type: 'text', text: '123.456.789-01' }, {
      port: port(), state: { journeyId: 'IDE', screenId: 'IDE-08', gateApproved: false, pendingStep: 'CON-02' }, sessionId: 's1', context: ctx,
    });
    expect(result.ok && result.value.state.screenId).toBe('CON-02');
    expect(result.ok && JSON.stringify(result.value.state)).not.toContain('12345678901');
  });

  it('remembers the protected destination while the person completes the gate', async () => {
    const assistance = port();
    const result = await runAssistanceTurn({ type: 'open', target: 'CON-02' }, {
      port: assistance, state: { journeyId: 'ENT', screenId: 'ENT-02', gateApproved: false }, sessionId: 's1', context: ctx,
    });
    expect(result.ok && result.value.state.screenId).toBe('IDE-01');
    expect(result.ok && result.value.state.pendingStep).toBe('CON-02');
    expect(assistance.getSessionSnapshot).not.toHaveBeenCalled();
  });

  it('continues from CPF Flow submit to the pending personal destination', async () => {
    const result = await runAssistanceTurn({ type: 'flow_submit', flowId: 'IDE-08', data: { cpf: '12345678901' } }, {
      port: port(), state: { journeyId: 'IDE', screenId: 'IDE-08', gateApproved: false, pendingStep: 'CON-02' }, sessionId: 's1', context: ctx,
    });
    expect(result.ok && result.value.state.screenId).toBe('CON-02');
  });

  it('extracts only a canonical CPF when the gate message also contains the pending request', async () => {
    const result = await runAssistanceTurn({ type: 'text', text: 'Meu CPF 12345678901, quero ver meu contrato' }, {
      port: port(), state: { journeyId: 'IDE', screenId: 'IDE-08', gateApproved: false, pendingStep: 'CON-02' }, sessionId: 's1', context: ctx,
    });
    expect(result.ok && result.value.state.screenId).toBe('CON-02');
    expect(result.ok && JSON.stringify(result.value.state)).not.toContain('12345678901');
  });

  it('rejects a stale quick reply that is not offered on the current screen', async () => {
    const result = await runAssistanceTurn({ type: 'quick_reply', target: 'CAN-05' }, {
      port: port(), state: { journeyId: 'DEP', screenId: 'DEP-33', gateApproved: true }, sessionId: 's1', context: ctx,
    });
    expect(result.ok && result.value.state.screenId).toBe('DEP-33');
  });

  it('keeps data exchange silent and does not call the assistance port', async () => {
    const assistance = port();
    const result = await runAssistanceTurn({ type: 'flow_data_exchange' }, { port: assistance, state, sessionId: 's1', context: ctx });
    expect(result.ok && result.value.replies).toEqual([]);
    expect(vi.mocked(assistance.getSessionSnapshot)).not.toHaveBeenCalled();
    expect(vi.mocked(assistance.addDependent)).not.toHaveBeenCalled();
  });

  it('routes only catalog audio fixtures to their deterministic catalog response', async () => {
    const audioSteps = assistanceCatalog.steps.filter((step) => step.mode === 'audio');
    expect(audioSteps).toHaveLength(4);
    for (const audio of audioSteps) {
      const result = await runAssistanceTurn({ type: 'voice', mediaId: audio.id, durationMs: 1800 }, {
        port: port(), state: { journeyId: 'ENT', screenId: 'ENT-02', gateApproved: true }, sessionId: `audio-${audio.id}`, context: ctx,
      });
      expect(result.ok && result.value.state.screenId).toBe(audio.id);
      expect(result.ok && result.value.replies[0]).toMatchObject({ type: 'message.text', payload: { text: audio.bot } });
    }
    const arbitrary = await runAssistanceTurn({ type: 'voice', mediaId: 'local-arbitrary', durationMs: 1800 }, {
      port: port(), state: { journeyId: 'ENT', screenId: 'ENT-02', gateApproved: true }, sessionId: 'audio-arbitrary', context: ctx,
    });
    expect(arbitrary.ok && arbitrary.value.state.screenId).toBe('ENT-02');
  });

  it('does not mutate while navigating to a review screen', async () => {
    const assistance = port();
    const reviewing = await runAssistanceTurn({ type: 'quick_reply', target: 'DEP-06' }, {
      port: assistance, state: { journeyId: 'DEP', screenId: 'DEP-05', gateApproved: true }, sessionId: 's1', context: ctx,
    });
    expect(reviewing.ok && reviewing.value.state.screenId).toBe('DEP-06');
    expect(assistance.addDependent).not.toHaveBeenCalled();
  });

  it('executes a supported operation only on the terminal review Flow submit', async () => {
    const assistance = port();
    const result = await runAssistanceTurn({ type: 'flow_submit', flowId: 'DEP-06', data: {} }, {
      port: assistance,
      state: { ...state, temporaryData: { name: 'João', cpf: '12345678901', birthDate: '2010-01-01', relationship: 'filho', phone: '11999999999', biologicalSex: 'male' } },
      sessionId: 's1', context: ctx,
    });
    expect(result.ok).toBe(true);
    expect(assistance.addDependent).toHaveBeenCalledTimes(1);
  });

  it('keeps malformed Flow submits away from every mutation', async () => {
    const assistance = port();
    const result = await runAssistanceTurn({ type: 'flow_submit', flowId: 'DEP-06', data: ['not', 'an', 'object'] }, {
      port: assistance, state, sessionId: 's1', context: ctx,
    });
    expect(result.ok).toBe(true);
    expect(assistance.addDependent).not.toHaveBeenCalled();
    expect(assistance.updateDependent).not.toHaveBeenCalled();
    expect(assistance.removeDependent).not.toHaveBeenCalled();
    expect(assistance.changeModality).not.toHaveBeenCalled();
    expect(assistance.cancelAssistance).not.toHaveBeenCalled();
    expect(assistance.renewAssistance).not.toHaveBeenCalled();
    expect(assistance.regularizeBilling).not.toHaveBeenCalled();
    expect(assistance.updatePreferences).not.toHaveBeenCalled();
    expect(assistance.createRequest).not.toHaveBeenCalled();
  });

  it('projects the catalog document list for each supported document screen', async () => {
    const assistance = port();
    const expected: Record<string, string[]> = {
      'CON-07': ['Termo de adesão', 'Condições do produto', 'Comprovante de contratação'],
      'UTI-09': ['Identificação do benefício'],
      'CAN-08': ['Termo de cancelamento'],
    };
    for (const [screenId, titles] of Object.entries(expected)) {
      const result = await runAssistanceTurn({ type: 'open', target: screenId }, {
        port: assistance, state: { journeyId: 'DOC', screenId: 'DOC-01', gateApproved: true }, sessionId: `s-${screenId}`, context: ctx,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        const documentEvent = result.value.replies.find((reply) => reply.type === 'message.document');
        expect(documentEvent).toMatchObject({ type: 'message.document', payload: { documents: titles.map((title) => expect.objectContaining({ title })) } });
        expect(documentEvent?.type === 'message.document' ? documentEvent.payload.documents.map((doc) => doc.title) : []).toEqual(titles);
        expect(UnsequencedServerEventSchema.safeParse({ v: 1, id: '00000000-0000-4000-8000-000000000001', sessionId: `s-${screenId}`, correlationId: 'corr-demo', ts: '2026-10-12T00:00:00.000Z', ...documentEvent }).success).toBe(true);
      }
    }
  });

  it('parses a natural dependent statement while assistance state is active', async () => {
    const assistance = port();
    const result = await runAssistanceTurn({ type: 'text', text: 'Quero incluir João, CPF 123.456.789-01, nascido em 03/02/2010, meu filho.' }, {
      port: assistance,
      state: { journeyId: 'DEP', screenId: 'DEP-33', gateApproved: true },
      sessionId: 's1', context: ctx,
    });
    expect(result.ok && result.value.state.temporaryData).toMatchObject({
      name: 'João', cpf: '12345678901', birth: '2010-02-03', relationship: 'filho',
    });
  });

  it('reads current dependents when entering the catalog dependents screen', async () => {
    const assistance = port();
    const result = await runAssistanceTurn({ type: 'open', target: 'DEP-10' }, {
      port: assistance, state: { journeyId: 'DEP', screenId: 'DEP-09', gateApproved: true }, sessionId: 's1', context: ctx,
    });
    expect(result.ok).toBe(true);
    expect(assistance.listDependents).toHaveBeenCalledTimes(1);
  });

  it('does not execute cancellation while opening its review screen', async () => {
    const assistance = port();
    await runAssistanceTurn({ type: 'open', target: 'CAN-05' }, {
      port: assistance, state: { journeyId: 'CAN', screenId: 'CAN-04', gateApproved: true }, sessionId: 's1', context: ctx,
    });
    expect(assistance.cancelAssistance).not.toHaveBeenCalled();
  });

  it.each([
    ['DEP-06', { name: 'João', cpf: '12345678901', birthDate: '2010-01-01', relationship: 'filho', phone: '11999999999', biologicalSex: 'male' }, 'addDependent'],
    ['DEP-21', { dependentId: 'd1', birthDate: '2010-01-02' }, 'updateDependent'],
    ['EXC-03', { dependentId: 'd1' }, 'removeDependent'],
    ['PLA-06', { modality: 'individual' }, 'changeModality'],
    ['CAN-05', { reason: 'solicitado' }, 'cancelAssistance'],
    ['REN-03', { consent: true }, 'renewAssistance'],
    ['COB-05', { reference: 'REF-DEMO-001' }, 'regularizeBilling'],
  ] as const)('invokes %s mutation only from its current review submit', async (screenId, data, method) => {
    const assistance = port();
    const result = await runAssistanceTurn({ type: 'flow_submit', flowId: screenId, data: screenId === 'REN-03' ? { consent: true } : {} }, {
      port: assistance,
      state: { journeyId: screenId.split('-')[0]!, screenId, gateApproved: true, temporaryData: Object.fromEntries(Object.entries(data).filter(([, value]) => typeof value === 'string')) },
      sessionId: 's1', context: ctx,
    });
    expect(assistance[method]).toHaveBeenCalledTimes(1);
    const expectedTarget = (assistanceCatalog.byId[screenId]!.flow as { target?: string }).target;
    expect(expectedTarget).toBeDefined();
    expect(assistanceCatalog.byId[screenId]!.destinations).toContain(expectedTarget);
    expect(result.ok && result.value.state.screenId).toBe(expectedTarget);
  });

  it('creates a human return request only on the catalogued explicit quick reply', async () => {
    const assistance = port();
    await runAssistanceTurn({ type: 'quick_reply', target: 'HUM-08' }, {
      port: assistance, state: { journeyId: 'HUM', screenId: 'HUM-05', gateApproved: true }, sessionId: 's1', context: ctx,
    });
    expect(assistance.createRequest).toHaveBeenCalledTimes(1);
  });

  it('does not reinterpret address update as the unrelated human handoff request kind', async () => {
    const assistance = port();
    const updateAddress = vi.fn(async () => ok({ id: 'a1', kind: 'address_update' as const, status: 'received' as const, message: 'Demonstração' }));
    Object.assign(assistance, { updateAddress });
    const result = await runAssistanceTurn({ type: 'flow_submit', flowId: 'CAD-03', data: {} }, {
      port: assistance, state: { journeyId: 'CAD', screenId: 'CAD-03', gateApproved: true, temporaryData: { postal: '00000-000', address: 'Rua Exemplo, 1', city: 'São Paulo/SP' } }, sessionId: 's1', context: ctx,
    });
    expect(assistance.createRequest).not.toHaveBeenCalled();
    expect(updateAddress).toHaveBeenCalledOnce();
    expect(result.ok && result.value.state.screenId).toBe('CAD-04');
  });

  it('creates a dedicated funeral assistance request on the final review submit', async () => {
    const assistance = port();
    const requestFuneralAssistance = vi.fn(async () => ok({ id: 'f1', kind: 'funeral_assistance' as const, status: 'received' as const, message: 'Demonstração' }));
    Object.assign(assistance, { requestFuneralAssistance });
    const result = await runAssistanceTurn({ type: 'flow_submit', flowId: 'FUN-06', data: {} }, {
      port: assistance, state: { journeyId: 'FUN', screenId: 'FUN-06', gateApproved: true, temporaryData: { funeralCity: 'São Paulo', funeralState: 'SP' } }, sessionId: 's1', context: ctx,
    });
    expect(requestFuneralAssistance).toHaveBeenCalledOnce();
    expect(assistance.createRequest).not.toHaveBeenCalled();
    expect(result.ok && result.value.state.screenId).toBe('FUN-07');
  });

  it('persists optional communication preferences on the preferences Flow submit', async () => {
    const assistance = port();
    const result = await runAssistanceTurn({
      type: 'flow_submit', flowId: 'PRE-02', data: { optionalDocs: 'false', optionalBenefits: 'true' },
    }, { port: assistance, state: { journeyId: 'PRE', screenId: 'PRE-02', gateApproved: true }, sessionId: 's1', context: ctx });
    expect(assistance.updatePreferences).toHaveBeenCalledWith('s1', {
      confirmed: true,
      preferences: { ...snapshot.preferences, optionalDocs: false, optionalBenefits: true },
    }, ctx);
    expect(result.ok && result.value.state.screenId).toBe('PRE-03');
  });

  it('keeps the preferences screen when the typed adapter rejects the update', async () => {
    const assistance = port();
    vi.mocked(assistance.updatePreferences).mockResolvedValue({ ok: false, error: 'unavailable' });
    const result = await runAssistanceTurn({
      type: 'flow_submit', flowId: 'PRE-02', data: { optionalDocs: false, optionalBenefits: true },
    }, { port: assistance, state: { journeyId: 'PRE', screenId: 'PRE-02', gateApproved: true }, sessionId: 's1', context: ctx });
    expect(result.ok && result.value.state.screenId).toBe('PRE-02');
    expect(result.ok && JSON.stringify(result.value.replies)).not.toContain('Preferências salvas');
  });

  it('does not confirm a dependent while a catalog required field is missing', async () => {
    const assistance = port();
    const result = await runAssistanceTurn({ type: 'flow_submit', flowId: 'DEP-06', data: {} }, {
      port: assistance,
      state: { ...state, temporaryData: { name: 'João', document: '12345678901', birth: '2010-01-01', relationship: 'Filho' } },
      sessionId: 's1', context: ctx,
    });
    expect(result.ok && result.value.state.screenId).toBe('DEP-06');
    expect(assistance.addDependent).not.toHaveBeenCalled();
    expect(result.ok && JSON.stringify(result.value.replies)).not.toContain('foi incluído');
  });

  it('carries validated form fields forward to the review state without mutating', async () => {
    const assistance = port();
    const result = await runAssistanceTurn({
      type: 'flow_submit', flowId: 'DEP-05', data: {
        name: 'João', birth: '2010-01-01', document: '12345678901', relationship: 'Filho', phone: '11999999999', biologicalSex: 'Masculino',
      },
    }, { port: assistance, state: { journeyId: 'DEP', screenId: 'DEP-05', gateApproved: true }, sessionId: 's1', context: ctx });
    expect(result.ok && result.value.state.screenId).toBe('DEP-06');
    expect(result.ok && result.value.state.temporaryData).toMatchObject({ name: 'João', document: '12345678901' });
    expect(assistance.addDependent).not.toHaveBeenCalled();
  });

  it('rejects a final submit whose Flow ID is not the current catalog screen', async () => {
    const assistance = port();
    const result = await runAssistanceTurn({ type: 'flow_submit', flowId: 'CAN-05', data: { consent: true } }, {
      port: assistance, state: { journeyId: 'REN', screenId: 'REN-03', gateApproved: true }, sessionId: 's1', context: ctx,
    });
    expect(result.ok && result.value.state.screenId).toBe('REN-03');
    expect(assistance.renewAssistance).not.toHaveBeenCalled();
    expect(assistance.cancelAssistance).not.toHaveBeenCalled();
  });

  it('preserves the review state and reports a specific renewal conflict', async () => {
    const assistance = port();
    vi.mocked(assistance.renewAssistance).mockResolvedValue({ ok: false, error: 'conflict' });
    const result = await runAssistanceTurn({ type: 'flow_submit', flowId: 'REN-03', data: { consent: true } }, {
      port: assistance, state: { journeyId: 'REN', screenId: 'REN-03', gateApproved: true }, sessionId: 's1', context: ctx,
    });
    expect(result.ok && result.value.state.screenId).toBe('REN-03');
    expect(result.ok && result.value.replies[0]).toMatchObject({
      type: 'message.text', payload: { text: expect.stringContaining('concluir esta etapa') },
    });
    expect(result.ok && JSON.stringify(result.value.replies)).not.toContain('indisponível');
  });

  it('preserves the review state and reports a specific cancellation conflict', async () => {
    const assistance = port();
    vi.mocked(assistance.cancelAssistance).mockResolvedValue({ ok: false, error: 'conflict' });
    const result = await runAssistanceTurn({ type: 'flow_submit', flowId: 'CAN-05', data: {} }, {
      port: assistance, state: { journeyId: 'CAN', screenId: 'CAN-05', gateApproved: true }, sessionId: 's1', context: ctx,
    });
    expect(result.ok && result.value.state.screenId).toBe('CAN-05');
    expect(result.ok && JSON.stringify(result.value.replies)).not.toContain('indisponível');
  });

  it.each([
    ['CAD-03', 'updateAddress', 'CAD-03'],
    ['FUN-06', 'requestFuneralAssistance', 'FUN-06'],
  ] as const)('preserves %s when its dedicated operation fails', async (screenId, method, expectedScreen) => {
    const assistance = port();
    vi.mocked(assistance[method]).mockResolvedValue({ ok: false, error: 'unavailable' });
    const result = await runAssistanceTurn({ type: 'flow_submit', flowId: screenId, data: {} }, {
      port: assistance,
      state: {
        journeyId: screenId.slice(0, 3), screenId, gateApproved: true,
        temporaryData: screenId === 'CAD-03'
          ? { postal: '01000-000', address: 'Rua Exemplo, 1', city: 'São Paulo/SP' }
          : { funeralCity: 'Campinas', funeralState: 'SP' },
      },
      sessionId: 's1', context: ctx,
    });
    expect(result.ok && result.value.state.screenId).toBe(expectedScreen);
    expect(result.ok && JSON.stringify(result.value.replies)).toContain('indisponível');
  });

  it('does not run a personal review operation when the CPF gate is closed', async () => {
    const assistance = port();
    const result = await runAssistanceTurn({ type: 'flow_submit', flowId: 'CAN-05', data: {} }, {
      port: assistance, state: { journeyId: 'CAN', screenId: 'CAN-05', gateApproved: false }, sessionId: 's1', context: ctx,
    });
    expect(assistance.cancelAssistance).not.toHaveBeenCalled();
    expect(result.ok && result.value.state.screenId).toBe('IDE-01');
    expect(result.ok && result.value.state.pendingStep).toBe('CAN-05');
  });

  it('blocks a stale personal review state before inspecting its Flow or mutating', async () => {
    const assistance = port();
    const result = await runAssistanceTurn({ type: 'flow_submit', flowId: 'DEP-06', data: {} }, {
      port: assistance,
      state: {
        journeyId: 'DEP', screenId: 'DEP-06', gateApproved: false,
        temporaryData: {
          name: 'João', document: '12345678901', birth: '2010-01-01', relationship: 'Filho',
          phone: '11999999999', biologicalSex: 'Masculino',
        },
      },
      sessionId: 's1', context: ctx,
    });
    expect(assistance.addDependent).not.toHaveBeenCalled();
    expect(assistance.getSessionSnapshot).not.toHaveBeenCalled();
    expect(result.ok && result.value.state.screenId).toBe('IDE-01');
    expect(result.ok && result.value.state.pendingStep).toBe('DEP-06');
  });
});
