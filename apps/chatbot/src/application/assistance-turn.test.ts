import { UnsequencedServerEventSchema, ok } from '@seguradora/protocol';
import { describe, expect, it, vi } from 'vitest';
import { assistanceCatalog } from '../domain/assistance-catalog';
import type { AssistanceDocumentScreen } from './assistance-service';
import type { AssistancePort } from './ports';
import { runAssistanceTurn } from './assistance-turn';

const ctx = { correlationId: 'corr-demo', idempotencyKey: 'idem-demo' };
it('renews access at IDE-06 and returns to the pending review without confirming a mutation', async () => {
  const assistance = port();
  const entered = await runAssistanceTurn(
    { type: 'open', target: 'IDE-06' },
    {
      port: assistance,
      sessionId: 'renew-review',
      context: ctx,
      state: {
        journeyId: 'CAN',
        screenId: 'CAN-05',
        gateApproved: true,
        temporaryData: { reason: 'Mudança' },
      },
    },
  );
  expect(entered.ok).toBe(true);
  if (!entered.ok) return;
  expect(entered.value.state.screenId).toBe('IDE-06');
  expect(entered.value.state.gateApproved).toBe(false);
  expect(entered.value.state.pendingStep).toBe('CAN-05');
  const resumed = await runAssistanceTurn(
    { type: 'text', text: '11111111111' },
    {
      port: assistance,
      sessionId: 'renew-review',
      context: ctx,
      state: entered.value.state,
    },
  );
  expect(resumed.ok && resumed.value.state.screenId).toBe('CAN-05');
  expect(assistance.cancelAssistance).not.toHaveBeenCalled();
});
it.each(['IDE-01', 'IDE-08', 'IDE-04', 'IDE-05', 'IDE-02', 'IDE-06'])(
  'accepts whole trimmed CPF chat at %s and preserves the pending draft',
  async (screenId) => {
    const result = await runAssistanceTurn(
      { type: 'text', text: ' 000.000.000-00 ' },
      {
        port: port(),
        sessionId: 'typed-cpf',
        context: ctx,
        state: {
          journeyId: 'IDE',
          screenId,
          gateApproved: false,
          pendingStep: 'ADE-04',
          temporaryData: { modality: 'individual', name: 'Ana' },
        },
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.state.screenId).toBe('ADE-05');
    expect(result.value.state.gateApproved).toBe(true);
    expect(result.value.state.temporaryData).toEqual({ modality: 'individual', name: 'Ana' });
    expect(JSON.stringify(result.value)).not.toContain('000.000.000-00');
  },
);
const state = { journeyId: 'DEP', screenId: 'DEP-06', gateApproved: true };
it.each([
  ['PLA', 'PLA-05', 'PLA-07'],
  ['CAN', 'CAN-04', 'CAN-06'],
])(
  'resolves shared confirmation text inside the active %s journey',
  async (journeyId, screenId, expected) => {
    const result = await runAssistanceTurn(
      { type: 'text', text: 'Quero confirmar.' },
      {
        port: port(),
        sessionId: 'contextual-confirmation',
        context: ctx,
        state: { journeyId, screenId, gateApproved: true },
      },
    );
    expect(result.ok && result.value.state.screenId).toBe(expected);
  },
);
it.each(['Maria Silva', 'Ana Maria Lima'])(
  'keeps the selected name %s intact in exclusion review',
  async (name) => {
    const result = await runAssistanceTurn(
      { type: 'open', target: 'EXC-03' },
      {
        port: port(),
        sessionId: 'selected-name',
        context: ctx,
        state: {
          journeyId: 'EXC',
          screenId: 'EXC-02',
          gateApproved: true,
          temporaryData: { dependentId: 'd1', dependentName: name },
        },
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const flow = result.value.replies.find((reply) => reply.type === 'message.flow');
    expect(JSON.stringify(flow)).toContain(`"text":"Pessoa: ${name}"`);
  },
);
const snapshot = {
  demonstrative: true as const,
  contract: { status: 'active' as const, modality: 'familiar' as const, since: '2026-10-10' },
  dependents: [],
  benefits: [],
  documents: [{ id: 'DOC-ADESAO-DEMO', title: 'Termo de adesão', status: 'available' as const }],
  billing: { status: 'demonstrative' as const, reference: 'REF-DEMO-001', message: 'Demonstração' },
  preferences: {
    contactChannel: 'whatsapp' as const,
    email: 'cliente@example.test',
    paperless: true,
    optionalDocs: true,
    optionalBenefits: false,
  },
  currentAddress: { postal: '01000-000', address: 'Rua das Flores, 100', city: 'São Paulo/SP' },
  requests: [],
};
const port = (): AssistancePort => ({
  getSessionSnapshot: vi.fn(async () => ok(snapshot)),
  listBenefits: vi.fn(async () => ok([])),
  listDocuments: vi.fn(async (_sessionId: string, screenId: AssistanceDocumentScreen) =>
    ok(
      {
        'CON-07': [
          { id: 'doc-adhesion', title: 'Termo de adesão', status: 'available' as const },
          { id: 'doc-conditions', title: 'Condições do produto', status: 'available' as const },
          { id: 'doc-proof', title: 'Comprovante de contratação', status: 'available' as const },
        ],
        'UTI-09': [
          { id: 'doc-benefit', title: 'Identificação do benefício', status: 'available' as const },
        ],
        'CAN-08': [
          { id: 'doc-cancellation', title: 'Termo de cancelamento', status: 'available' as const },
        ],
      }[screenId],
    ),
  ),
  listDependents: vi.fn(async () => ok([])),
  addDependent: vi.fn(async () =>
    ok({
      id: 'd1',
      name: 'João',
      cpf: '12345678901',
      birthDate: '2010-01-01',
      relationship: 'filho',
      phone: '11999999999',
      biologicalSex: 'male' as const,
    }),
  ),
  updateDependent: vi.fn(async () =>
    ok({
      id: 'd1',
      name: 'João',
      cpf: '12345678901',
      birthDate: '2010-01-01',
      relationship: 'filho',
      phone: '11999999999',
      biologicalSex: 'male' as const,
    }),
  ),
  removeDependent: vi.fn(async () => ok(undefined)),
  cancelDependentRemoval: vi.fn(async () => ok(undefined)),
  changeModality: vi.fn(async () => ok(undefined)),
  renewAssistance: vi.fn(async () =>
    ok({
      id: 'r1',
      kind: 'renewal' as const,
      status: 'received' as const,
      message: 'Demonstração',
    }),
  ),
  cancelAssistance: vi.fn(async () =>
    ok({
      id: 'r1',
      kind: 'cancellation' as const,
      status: 'received' as const,
      message: 'Demonstração',
    }),
  ),
  updateAddress: vi.fn(async () =>
    ok({
      id: 'a1',
      kind: 'address_update' as const,
      status: 'received' as const,
      message: 'Demonstração',
    }),
  ),
  requestFuneralAssistance: vi.fn(async () =>
    ok({
      id: 'f1',
      kind: 'funeral_assistance' as const,
      status: 'received' as const,
      message: 'Demonstração',
    }),
  ),
  getBilling: vi.fn(async () => ok(snapshot.billing)),
  regularizeBilling: vi.fn(async () => ok(snapshot.billing)),
  getPreferences: vi.fn(async () => ok(snapshot.preferences)),
  updatePreferences: vi.fn(async (_sessionId, command) => ok(command.preferences)),
  listRequests: vi.fn(async () => ok([])),
  createRequest: vi.fn(async () =>
    ok({
      id: 'r1',
      kind: 'human_handoff' as const,
      status: 'received' as const,
      message: 'Demonstração',
    }),
  ),
  getRequest: vi.fn(async () =>
    ok({
      id: 'r1',
      kind: 'human_handoff' as const,
      status: 'received' as const,
      message: 'Demonstração',
    }),
  ),
});

describe('runAssistanceTurn', () => {
  it('emits a valid review invitation without presenting the opening CTA as final confirmation', async () => {
    const assistance = port();
    const result = await runAssistanceTurn(
      { type: 'open', target: 'CAN-05' },
      {
        port: assistance,
        state: { journeyId: 'CAN', screenId: 'CAN-04', gateApproved: true },
        sessionId: 'review-invitation',
        context: ctx,
      },
    );
    expect(result.ok && result.value.replies[0]).toMatchObject({
      type: 'message.flow',
      payload: { ctaLabel: 'Abrir revisão' },
    });
    expect(assistance.cancelAssistance).not.toHaveBeenCalled();
  });
  it('uses the supplied birth correction rather than the date from the demonstration script', async () => {
    const assistance = port();
    const draft = {
      name: 'João',
      cpf: '12345678901',
      birth: '2004-03-12',
      relationship: 'filho',
      phone: '11999999999',
      biologicalSex: 'male',
    };
    const result = await runAssistanceTurn(
      { type: 'text', text: 'A data correta é 20/05/2012.' },
      {
        port: assistance,
        state: { journeyId: 'DEP', screenId: 'DEP-14', gateApproved: true, temporaryData: draft },
        sessionId: 'actual-correction',
        context: ctx,
      },
    );
    expect(result.ok && result.value.state.screenId).toBe('DEP-16');
    expect(result.ok && result.value.state.temporaryData).toEqual({
      ...draft,
      birth: '2012-05-20',
    });
    expect(assistance.addDependent).not.toHaveBeenCalled();
  });
  it('serves a single discovery Flow and gates its final contracting intent', async () => {
    const assistance = port();
    const opened = await runAssistanceTurn(
      { type: 'open', target: 'DES-01' },
      {
        port: assistance,
        state: { journeyId: 'ENT', screenId: 'ENT-02', gateApproved: false },
        sessionId: 'list',
        context: ctx,
      },
    );
    expect(opened.ok && opened.value.replies[0]).toMatchObject({
      type: 'message.flow',
      payload: { flowId: 'DES-01', flowJson: { version: '7.1', screens: expect.any(Array) } },
    });
    const chosen = await runAssistanceTurn(
      {
        type: 'flow_submit',
        flowId: 'DES-01',
        data: { intent: 'contract', service: '2', modality: 'individual' },
      },
      {
        port: assistance,
        state: { journeyId: 'DES', screenId: 'DES-01', gateApproved: false },
        sessionId: 'list',
        context: ctx,
      },
    );
    expect(chosen.ok && chosen.value.state.screenId).toBe('IDE-01');
    expect(chosen.ok && chosen.value.state.pendingStep).toBe('ADE-03');
    expect(chosen.ok && chosen.value.state.temporaryData?.modality).toBe('individual');
    expect(assistance.createRequest).not.toHaveBeenCalled();
  });
  it.each(['individual', 'familiar'])(
    'continues discovery into the selected %s contract without another CPF gate',
    async (modality) => {
      const assistance = port();
      const result = await runAssistanceTurn(
        {
          type: 'flow_submit',
          flowId: 'DES-01',
          data: { intent: 'contract', service: '2', modality, cpf: '123.456.789-00' },
        },
        {
          port: assistance,
          state: { journeyId: 'DES', screenId: 'DES-01', gateApproved: false },
          sessionId: 'discovery',
          context: ctx,
        },
      );
      expect(result.ok && result.value.state).toMatchObject({
        screenId: 'ADE-03',
        gateApproved: true,
        temporaryData: { service: '2', modality },
      });
      expect(JSON.stringify(result.ok && result.value.state)).not.toContain('123.456.789-00');
      expect(JSON.stringify(result.ok && result.value.state)).not.toContain('12345678900');
      expect(JSON.stringify(result.ok && result.value.replies)).toContain('Telemedicina');
      expect(JSON.stringify(result.ok && result.value.replies)).toContain(
        modality === 'individual' ? 'Individual' : 'Familiar',
      );
      if (!result.ok) return;
      const flow = result.value.replies.find((reply) => reply.type === 'message.flow');
      expect(flow && flow.type === 'message.flow' && flow.payload.flowJson.autoOpen).toBe(true);
      expect(result.value.replies.some((reply) => reply.type === 'message.quick_replies')).toBe(
        false,
      );
      expect(assistance.createRequest).not.toHaveBeenCalled();
    },
  );
  it.each(['individual', 'familiar'])(
    'submits holder, payment and consent once for %s without intermediate Flows',
    async (modality) => {
      const assistance = port();
      const state = {
        journeyId: 'ADE',
        screenId: 'ADE-03',
        gateApproved: true,
        temporaryData: { service: '2', modality },
      };
      const data = {
        holder: 'Beatriz Costa',
        email: 'beatriz@example.com',
        payment: 'Cartão cadastrado •• 2048',
        consent: true,
      };
      const result = await runAssistanceTurn(
        { type: 'flow_submit', flowId: 'ADE-03', data },
        { port: assistance, state, sessionId: 'contract', context: ctx },
      );
      expect(result.ok && result.value.state.screenId).toBe('ADE-08');
      expect(result.ok && result.value.state.temporaryData).toMatchObject({
        ...data,
        consent: 'true',
        modality,
        service: '2',
      });
      expect(JSON.stringify(result.ok && result.value.replies)).not.toContain('Escolher pagamento');
      expect(result.ok && result.value.replies.some((reply) => reply.type === 'message.flow')).toBe(
        false,
      );
    },
  );
  it.each([
    {
      holder: 'Beatriz',
      email: 'beatriz@example.com',
      payment: 'Cartão cadastrado •• 2048',
      consent: false,
    },
    { holder: 'Beatriz', email: 'inválido', payment: 'Cartão cadastrado •• 2048', consent: true },
    { holder: 'Beatriz', email: 'beatriz@example.com', payment: 'inexistente', consent: true },
    { holder: 'Beatriz', email: 'beatriz@example.com', payment: 'Cartão cadastrado •• 2048' },
  ])('rejects incomplete or unconfirmed contracting submission %j', async (data) => {
    const assistance = port();
    const result = await runAssistanceTurn(
      { type: 'flow_submit', flowId: 'ADE-03', data },
      {
        port: assistance,
        state: { journeyId: 'ADE', screenId: 'ADE-03', gateApproved: true },
        sessionId: 'contract',
        context: ctx,
      },
    );
    expect(result.ok && result.value.state.screenId).toBe('ADE-03');
    expect(assistance.createRequest).not.toHaveBeenCalled();
  });
  it('preserves selected holder and payment when correcting a contract', async () => {
    const result = await runAssistanceTurn(
      { type: 'flow_submit', flowId: 'ADE-06', data: { correction: true } },
      {
        port: port(),
        state: {
          journeyId: 'ADE',
          screenId: 'ADE-06',
          gateApproved: true,
          temporaryData: {
            service: '1',
            modality: 'individual',
            holder: 'Beatriz',
            email: 'beatriz@example.com',
            payment: 'Outro meio disponível',
          },
        },
        sessionId: 'contract',
        context: ctx,
      },
    );
    expect(result.ok && result.value.state.screenId).toBe('ADE-03');
    const flow = result.ok && result.value.replies.find((reply) => reply.type === 'message.flow');
    expect(flow && flow.type === 'message.flow' && flow.payload.initialData).toMatchObject({
      values: { holder: 'Beatriz', email: 'beatriz@example.com', payment: 'Outro meio disponível' },
    });
    expect(JSON.stringify(flow)).toContain('Assistência Farmácia');
    expect(JSON.stringify(flow)).toContain('R$ 29,90');
  });
  it('rejects invalid discovery CPF without approving the gate or losing the current journey', async () => {
    const result = await runAssistanceTurn(
      {
        type: 'flow_submit',
        flowId: 'DES-01',
        data: { intent: 'contract', service: '1', modality: 'familiar', cpf: '12345' },
      },
      {
        port: port(),
        state: { journeyId: 'DES', screenId: 'DES-01', gateApproved: false },
        sessionId: 'discovery',
        context: ctx,
      },
    );
    expect(result.ok && result.value.state).toMatchObject({
      screenId: 'DES-01',
      gateApproved: false,
    });
    expect(JSON.stringify(result.ok && result.value.replies)).toContain('11 dígitos');
  });
  it('does not ask identified customers for CPF again when opening discovery', async () => {
    const result = await runAssistanceTurn(
      { type: 'open', target: 'DES-01' },
      {
        port: port(),
        state: { journeyId: 'NAV', screenId: 'NAV-01', gateApproved: true },
        sessionId: 'identified',
        context: ctx,
      },
    );
    const reply = result.ok && result.value.replies.find((reply) => reply.type === 'message.flow');
    expect(reply && JSON.stringify(reply)).not.toContain('"name":"cpf"');
  });
  it('rejects an unselected catalog form option at the chatbot boundary', async () => {
    const result = await runAssistanceTurn(
      { type: 'flow_submit', flowId: 'DES-07', data: { composition: 'Selecione' } },
      {
        port: port(),
        state: { journeyId: 'DES', screenId: 'DES-07', gateApproved: true },
        sessionId: 'unselected',
        context: ctx,
      },
    );
    expect(result.ok && result.value.state.screenId).toBe('DES-07');
  });
  it('routes a review correction without mutation and retains earlier form values', async () => {
    const assistance = port();
    const earlier = { postal: '01000-000', address: 'Rua A, 1', city: 'São Paulo/SP' };
    const result = await runAssistanceTurn(
      { type: 'flow_submit', flowId: 'CAD-03', data: { correction: true } },
      {
        port: assistance,
        state: { journeyId: 'CAD', screenId: 'CAD-03', gateApproved: true, temporaryData: earlier },
        sessionId: 'correction',
        context: ctx,
      },
    );
    expect(result.ok && result.value.state.screenId).toBe('CAD-02');
    expect(result.ok && result.value.state.temporaryData).toEqual(earlier);
    expect(assistance.updateAddress).not.toHaveBeenCalled();
  });
  it('carries a safe draft through review, correction, and one terminal mutation', async () => {
    const assistance = port();
    const first = await runAssistanceTurn(
      {
        type: 'flow_submit',
        flowId: 'CAD-02',
        data: {
          postal: '01000-000',
          address: 'Rua A, 1',
          city: 'São Paulo/SP',
        },
      },
      {
        port: assistance,
        state: { journeyId: 'CAD', screenId: 'CAD-02', gateApproved: true },
        sessionId: 'draft',
        context: ctx,
      },
    );
    expect(first.ok && first.value.replies[0]).toMatchObject({
      type: 'message.flow',
      payload: {
        flowId: 'CAD-03',
        initialData: {
          intent: 'review',
          values: { postal: '01000-000', address: 'Rua A, 1', city: 'São Paulo/SP' },
        },
      },
    });

    const correction = await runAssistanceTurn(
      { type: 'flow_submit', flowId: 'CAD-03', data: { correction: true } },
      {
        port: assistance,
        state: first.ok ? first.value.state : state,
        sessionId: 'draft',
        context: ctx,
      },
    );
    expect(correction.ok && correction.value.replies[0]).toMatchObject({
      type: 'message.flow',
      payload: {
        flowId: 'CAD-02',
        initialData: {
          intent: 'correction',
          values: { postal: '01000-000', address: 'Rua A, 1', city: 'São Paulo/SP' },
        },
      },
    });
    const corrected = await runAssistanceTurn(
      {
        type: 'flow_submit',
        flowId: 'CAD-02',
        data: {
          postal: '01000-000',
          address: 'Rua B, 2',
          city: 'São Paulo/SP',
        },
      },
      {
        port: assistance,
        state: correction.ok ? correction.value.state : state,
        sessionId: 'draft',
        context: ctx,
      },
    );
    expect(corrected.ok && corrected.value.replies[0]).toMatchObject({
      type: 'message.flow',
      payload: {
        flowId: 'CAD-03',
        initialData: {
          intent: 'review',
          values: { postal: '01000-000', address: 'Rua B, 2', city: 'São Paulo/SP' },
        },
      },
    });
    expect(assistance.updateAddress).not.toHaveBeenCalled();
    const reviewedState = corrected.ok ? corrected.value.state : state;
    const confirmed = await runAssistanceTurn(
      { type: 'flow_submit', flowId: 'CAD-03', data: {} },
      {
        port: assistance,
        state: reviewedState,
        sessionId: 'draft',
        context: ctx,
      },
    );
    expect(confirmed.ok).toBe(true);
    expect(assistance.updateAddress).toHaveBeenCalledTimes(1);
    const duplicate = await runAssistanceTurn(
      { type: 'flow_submit', flowId: 'CAD-03', data: {} },
      {
        port: assistance,
        state: confirmed.ok ? confirmed.value.state : state,
        sessionId: 'draft',
        context: ctx,
      },
    );
    expect(duplicate.ok).toBe(true);
    expect(assistance.updateAddress).toHaveBeenCalledTimes(1);
  });
  it('masks CPF while showing ordinary values in cross-step review data', async () => {
    const canary = '98765432109';
    const result = await runAssistanceTurn(
      {
        type: 'flow_submit',
        flowId: 'DEP-05',
        data: {
          name: 'Ana Lima',
          birth: '2014-03-12',
          document: canary,
          relationship: 'Filha',
          phone: '11999999999',
          biologicalSex: 'Feminino',
        },
      },
      {
        port: port(),
        state: { journeyId: 'DEP', screenId: 'DEP-05', gateApproved: true },
        sessionId: 'cpf-mask',
        context: ctx,
      },
    );
    const serialized = JSON.stringify(result.ok ? result.value.replies : result);
    expect(serialized).not.toContain(canary);
    expect(serialized).toContain('•••.•••.•••-09');
    expect(serialized).toContain('Ana Lima');
  });
  it('does not hydrate a review Flow from a stale draft when it was not reached by form submit', async () => {
    const result = await runAssistanceTurn(
      { type: 'open', target: 'DEP-06' },
      {
        port: port(),
        state: {
          journeyId: 'CAD',
          screenId: 'CAD-02',
          gateApproved: true,
          temporaryData: { name: 'Old journey', document: '98765432109' },
        },
        sessionId: 'stale-draft',
        context: ctx,
      },
    );
    const flow = result.ok
      ? result.value.replies.find((reply) => reply.type === 'message.flow')
      : undefined;
    expect(flow?.type === 'message.flow' && flow.payload.initialData).toBeUndefined();
  });
  it('opens contracts directly and never retains the submitted gate CPF', async () => {
    const assistance = port();
    const result = await runAssistanceTurn(
      { type: 'cpf_submit', cpf: '123.456.789-01' },
      {
        port: assistance,
        state: { journeyId: 'IDE', screenId: 'IDE-08', gateApproved: false },
        sessionId: 's1',
        context: ctx,
      },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.state).toEqual({
        journeyId: 'CON',
        screenId: 'CON-01',
        gateApproved: true,
      });
      expect(JSON.stringify(result.value.state)).not.toContain('12345678901');
    }
    expect(assistance.getSessionSnapshot).not.toHaveBeenCalled();
  });

  it('continues to the previously requested personal screen after a valid CPF gate', async () => {
    const result = await runAssistanceTurn(
      { type: 'text', text: '123.456.789-01' },
      {
        port: port(),
        state: { journeyId: 'IDE', screenId: 'IDE-08', gateApproved: false, pendingStep: 'CON-02' },
        sessionId: 's1',
        context: ctx,
      },
    );
    expect(result.ok && result.value.state.screenId).toBe('CON-02');
    expect(result.ok && JSON.stringify(result.value.state)).not.toContain('12345678901');
  });

  it('remembers the protected destination while the person completes the gate', async () => {
    const assistance = port();
    const result = await runAssistanceTurn(
      { type: 'open', target: 'CON-02' },
      {
        port: assistance,
        state: { journeyId: 'ENT', screenId: 'ENT-02', gateApproved: false },
        sessionId: 's1',
        context: ctx,
      },
    );
    expect(result.ok && result.value.state.screenId).toBe('IDE-01');
    expect(result.ok && result.value.state.pendingStep).toBe('CON-02');
    expect(assistance.getSessionSnapshot).not.toHaveBeenCalled();
  });

  it('rejects obsolete CPF Flow submit without opening the gate', async () => {
    const result = await runAssistanceTurn(
      { type: 'flow_submit', flowId: 'IDE-08', data: { cpf: '12345678901' } },
      {
        port: port(),
        state: { journeyId: 'IDE', screenId: 'IDE-08', gateApproved: false, pendingStep: 'CON-02' },
        sessionId: 's1',
        context: ctx,
      },
    );
    expect(result.ok && result.value.state.screenId).toBe('IDE-08');
    expect(result.ok && result.value.state.gateApproved).toBe(false);
  });

  it('rejects a CPF embedded in a statement', async () => {
    const result = await runAssistanceTurn(
      { type: 'text', text: 'Meu CPF 12345678901, quero ver meu contrato' },
      {
        port: port(),
        state: { journeyId: 'IDE', screenId: 'IDE-08', gateApproved: false, pendingStep: 'CON-02' },
        sessionId: 's1',
        context: ctx,
      },
    );
    expect(result.ok && result.value.state.screenId).toBe('IDE-04');
    expect(result.ok && result.value.state.gateApproved).toBe(false);
    expect(result.ok && JSON.stringify(result.value.state)).not.toContain('12345678901');
  });

  it('rejects a stale quick reply that is not offered on the current screen', async () => {
    const result = await runAssistanceTurn(
      { type: 'quick_reply', target: 'CAN-05' },
      {
        port: port(),
        state: { journeyId: 'DEP', screenId: 'DEP-33', gateApproved: true },
        sessionId: 's1',
        context: ctx,
      },
    );
    expect(result.ok && result.value.state.screenId).toBe('DEP-33');
  });

  it('keeps data exchange silent and does not call the assistance port', async () => {
    const assistance = port();
    const result = await runAssistanceTurn(
      { type: 'flow_data_exchange' },
      { port: assistance, state, sessionId: 's1', context: ctx },
    );
    expect(result.ok && result.value.replies).toEqual([]);
    expect(vi.mocked(assistance.getSessionSnapshot)).not.toHaveBeenCalled();
    expect(vi.mocked(assistance.addDependent)).not.toHaveBeenCalled();
  });

  it('routes only catalog audio fixtures to their deterministic catalog response', async () => {
    const audioSteps = assistanceCatalog.steps.filter((step) => step.mode === 'audio');
    expect(audioSteps).toHaveLength(4);
    for (const audio of audioSteps) {
      const result = await runAssistanceTurn(
        { type: 'voice', mediaId: audio.id, durationMs: 1800 },
        {
          port: port(),
          state: { journeyId: 'ENT', screenId: 'ENT-02', gateApproved: true },
          sessionId: `audio-${audio.id}`,
          context: ctx,
        },
      );
      expect(result.ok && result.value.state.screenId).toBe(audio.id);
      expect(result.ok && result.value.replies[0]).toMatchObject({
        type: 'message.text',
        payload: { text: audio.bot },
      });
    }
    const arbitrary = await runAssistanceTurn(
      { type: 'voice', mediaId: 'local-arbitrary', durationMs: 1800 },
      {
        port: port(),
        state: { journeyId: 'ENT', screenId: 'ENT-02', gateApproved: true },
        sessionId: 'audio-arbitrary',
        context: ctx,
      },
    );
    expect(arbitrary.ok && arbitrary.value.state.screenId).toBe('ENT-02');
  });

  it('does not mutate while navigating to a review screen', async () => {
    const assistance = port();
    const reviewing = await runAssistanceTurn(
      { type: 'quick_reply', target: 'DEP-06' },
      {
        port: assistance,
        state: { journeyId: 'DEP', screenId: 'DEP-05', gateApproved: true },
        sessionId: 's1',
        context: ctx,
      },
    );
    expect(reviewing.ok && reviewing.value.state.screenId).toBe('DEP-06');
    expect(assistance.addDependent).not.toHaveBeenCalled();
  });

  it('executes a supported operation only on the terminal review Flow submit', async () => {
    const assistance = port();
    const result = await runAssistanceTurn(
      { type: 'flow_submit', flowId: 'DEP-06', data: {} },
      {
        port: assistance,
        state: {
          ...state,
          temporaryData: {
            name: 'João',
            cpf: '12345678901',
            birthDate: '2010-01-01',
            relationship: 'filho',
            phone: '11999999999',
            biologicalSex: 'male',
          },
        },
        sessionId: 's1',
        context: ctx,
      },
    );
    expect(result.ok).toBe(true);
    expect(assistance.addDependent).toHaveBeenCalledTimes(1);
  });

  it('keeps malformed Flow submits away from every mutation', async () => {
    const assistance = port();
    const result = await runAssistanceTurn(
      { type: 'flow_submit', flowId: 'DEP-06', data: ['not', 'an', 'object'] },
      {
        port: assistance,
        state,
        sessionId: 's1',
        context: ctx,
      },
    );
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
      const result = await runAssistanceTurn(
        { type: 'open', target: screenId },
        {
          port: assistance,
          state: { journeyId: 'DOC', screenId: 'DOC-01', gateApproved: true },
          sessionId: `s-${screenId}`,
          context: ctx,
        },
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        const documentEvent = result.value.replies.find(
          (reply) => reply.type === 'message.document',
        );
        expect(documentEvent).toMatchObject({
          type: 'message.document',
          payload: { documents: titles.map((title) => expect.objectContaining({ title })) },
        });
        expect(
          documentEvent?.type === 'message.document'
            ? documentEvent.payload.documents.map((doc) => doc.title)
            : [],
        ).toEqual(titles);
        expect(
          UnsequencedServerEventSchema.safeParse({
            v: 1,
            id: '00000000-0000-4000-8000-000000000001',
            sessionId: `s-${screenId}`,
            correlationId: 'corr-demo',
            ts: '2026-10-12T00:00:00.000Z',
            ...documentEvent,
          }).success,
        ).toBe(true);
      }
    }
  });

  it('parses a natural dependent statement while assistance state is active', async () => {
    const assistance = port();
    const result = await runAssistanceTurn(
      {
        type: 'text',
        text: 'Quero incluir João, CPF 123.456.789-01, nascido em 03/02/2010, meu filho.',
      },
      {
        port: assistance,
        state: { journeyId: 'DEP', screenId: 'DEP-33', gateApproved: true },
        sessionId: 's1',
        context: ctx,
      },
    );
    expect(result.ok && result.value.state.temporaryData).toMatchObject({
      name: 'João',
      cpf: '12345678901',
      birth: '2010-02-03',
      relationship: 'filho',
    });
  });

  it('reads current dependents when entering the catalog dependents screen', async () => {
    const assistance = port();
    const result = await runAssistanceTurn(
      { type: 'open', target: 'DEP-10' },
      {
        port: assistance,
        state: { journeyId: 'DEP', screenId: 'DEP-09', gateApproved: true },
        sessionId: 's1',
        context: ctx,
      },
    );
    expect(result.ok).toBe(true);
    expect(assistance.listDependents).toHaveBeenCalledTimes(1);
  });

  it('does not execute cancellation while opening its review screen', async () => {
    const assistance = port();
    await runAssistanceTurn(
      { type: 'open', target: 'CAN-05' },
      {
        port: assistance,
        state: { journeyId: 'CAN', screenId: 'CAN-04', gateApproved: true },
        sessionId: 's1',
        context: ctx,
      },
    );
    expect(assistance.cancelAssistance).not.toHaveBeenCalled();
  });

  it.each([
    [
      'DEP-06',
      {
        name: 'João',
        cpf: '12345678901',
        birthDate: '2010-01-01',
        relationship: 'filho',
        phone: '11999999999',
        biologicalSex: 'male',
      },
      'addDependent',
    ],
    ['DEP-21', { dependentId: 'd1', birthDate: '2010-01-02' }, 'updateDependent'],
    ['EXC-03', { dependentId: 'd1' }, 'removeDependent'],
    ['PLA-06', { modality: 'individual' }, 'changeModality'],
    ['CAN-05', { reason: 'solicitado' }, 'cancelAssistance'],
    ['REN-03', { consent: true }, 'renewAssistance'],
    ['COB-05', { reference: 'REF-DEMO-001' }, 'regularizeBilling'],
  ] as const)(
    'invokes %s mutation only from its current review submit',
    async (screenId, data, method) => {
      const assistance = port();
      const result = await runAssistanceTurn(
        {
          type: 'flow_submit',
          flowId: screenId,
          data: screenId === 'REN-03' ? { consent: true } : {},
        },
        {
          port: assistance,
          state: {
            journeyId: screenId.split('-')[0]!,
            screenId,
            gateApproved: true,
            temporaryData: Object.fromEntries(
              Object.entries(data).filter(([, value]) => typeof value === 'string'),
            ),
          },
          sessionId: 's1',
          context: ctx,
        },
      );
      expect(assistance[method]).toHaveBeenCalledTimes(1);
      const expectedTarget = (assistanceCatalog.byId[screenId]!.flow as { target?: string }).target;
      expect(expectedTarget).toBeDefined();
      expect(assistanceCatalog.byId[screenId]!.destinations).toContain(expectedTarget);
      expect(result.ok && result.value.state.screenId).toBe(expectedTarget);
    },
  );

  it('creates a human return request only on the catalogued explicit quick reply', async () => {
    const assistance = port();
    await runAssistanceTurn(
      { type: 'quick_reply', target: 'HUM-08' },
      {
        port: assistance,
        state: { journeyId: 'HUM', screenId: 'HUM-05', gateApproved: true },
        sessionId: 's1',
        context: ctx,
      },
    );
    expect(assistance.createRequest).toHaveBeenCalledTimes(1);
  });

  it('does not reinterpret address update as the unrelated human handoff request kind', async () => {
    const assistance = port();
    const updateAddress = vi.fn(async () =>
      ok({
        id: 'a1',
        kind: 'address_update' as const,
        status: 'received' as const,
        message: 'Demonstração',
      }),
    );
    Object.assign(assistance, { updateAddress });
    const result = await runAssistanceTurn(
      { type: 'flow_submit', flowId: 'CAD-03', data: {} },
      {
        port: assistance,
        state: {
          journeyId: 'CAD',
          screenId: 'CAD-03',
          gateApproved: true,
          temporaryData: { postal: '00000-000', address: 'Rua Exemplo, 1', city: 'São Paulo/SP' },
        },
        sessionId: 's1',
        context: ctx,
      },
    );
    expect(assistance.createRequest).not.toHaveBeenCalled();
    expect(updateAddress).toHaveBeenCalledOnce();
    expect(result.ok && result.value.state.screenId).toBe('CAD-04');
  });

  it('creates a dedicated funeral assistance request on the final review submit', async () => {
    const assistance = port();
    const requestFuneralAssistance = vi.fn(async () =>
      ok({
        id: 'f1',
        kind: 'funeral_assistance' as const,
        status: 'received' as const,
        message: 'Demonstração',
      }),
    );
    Object.assign(assistance, { requestFuneralAssistance });
    const result = await runAssistanceTurn(
      { type: 'flow_submit', flowId: 'FUN-06', data: {} },
      {
        port: assistance,
        state: {
          journeyId: 'FUN',
          screenId: 'FUN-06',
          gateApproved: true,
          temporaryData: { funeralCity: 'São Paulo', funeralState: 'SP' },
        },
        sessionId: 's1',
        context: ctx,
      },
    );
    expect(requestFuneralAssistance).toHaveBeenCalledOnce();
    expect(assistance.createRequest).not.toHaveBeenCalled();
    expect(result.ok && result.value.state.screenId).toBe('FUN-07');
  });

  it('persists optional communication preferences on the preferences Flow submit', async () => {
    const assistance = port();
    const result = await runAssistanceTurn(
      {
        type: 'flow_submit',
        flowId: 'PRE-02',
        data: { optionalDocs: 'false', optionalBenefits: 'true' },
      },
      {
        port: assistance,
        state: { journeyId: 'PRE', screenId: 'PRE-02', gateApproved: true },
        sessionId: 's1',
        context: ctx,
      },
    );
    expect(assistance.updatePreferences).toHaveBeenCalledWith(
      's1',
      {
        confirmed: true,
        preferences: { ...snapshot.preferences, optionalDocs: false, optionalBenefits: true },
      },
      ctx,
    );
    expect(result.ok && result.value.state.screenId).toBe('PRE-03');
  });

  it('keeps the preferences screen when the typed adapter rejects the update', async () => {
    const assistance = port();
    vi.mocked(assistance.updatePreferences).mockResolvedValue({ ok: false, error: 'unavailable' });
    const result = await runAssistanceTurn(
      {
        type: 'flow_submit',
        flowId: 'PRE-02',
        data: { optionalDocs: false, optionalBenefits: true },
      },
      {
        port: assistance,
        state: { journeyId: 'PRE', screenId: 'PRE-02', gateApproved: true },
        sessionId: 's1',
        context: ctx,
      },
    );
    expect(result.ok && result.value.state.screenId).toBe('PRE-02');
    expect(result.ok && JSON.stringify(result.value.replies)).not.toContain('Preferências salvas');
  });

  it('does not confirm a dependent while a catalog required field is missing', async () => {
    const assistance = port();
    const result = await runAssistanceTurn(
      { type: 'flow_submit', flowId: 'DEP-06', data: {} },
      {
        port: assistance,
        state: {
          ...state,
          temporaryData: {
            name: 'João',
            document: '12345678901',
            birth: '2010-01-01',
            relationship: 'Filho',
          },
        },
        sessionId: 's1',
        context: ctx,
      },
    );
    expect(result.ok && result.value.state.screenId).toBe('DEP-06');
    expect(assistance.addDependent).not.toHaveBeenCalled();
    expect(result.ok && JSON.stringify(result.value.replies)).not.toContain('foi incluído');
  });

  it('carries validated form fields forward to the review state without mutating', async () => {
    const assistance = port();
    const result = await runAssistanceTurn(
      {
        type: 'flow_submit',
        flowId: 'DEP-05',
        data: {
          name: 'João',
          birth: '2010-01-01',
          document: '12345678901',
          relationship: 'Filho',
          phone: '11999999999',
          biologicalSex: 'Masculino',
        },
      },
      {
        port: assistance,
        state: { journeyId: 'DEP', screenId: 'DEP-05', gateApproved: true },
        sessionId: 's1',
        context: ctx,
      },
    );
    expect(result.ok && result.value.state.screenId).toBe('DEP-06');
    expect(result.ok && result.value.state.temporaryData).toMatchObject({
      name: 'João',
      document: '12345678901',
    });
    expect(assistance.addDependent).not.toHaveBeenCalled();
  });

  it('rejects a final submit whose Flow ID is not the current catalog screen', async () => {
    const assistance = port();
    const result = await runAssistanceTurn(
      { type: 'flow_submit', flowId: 'CAN-05', data: { consent: true } },
      {
        port: assistance,
        state: { journeyId: 'REN', screenId: 'REN-03', gateApproved: true },
        sessionId: 's1',
        context: ctx,
      },
    );
    expect(result.ok && result.value.state.screenId).toBe('REN-03');
    expect(assistance.renewAssistance).not.toHaveBeenCalled();
    expect(assistance.cancelAssistance).not.toHaveBeenCalled();
  });

  it('preserves the review state and reports a specific renewal conflict', async () => {
    const assistance = port();
    vi.mocked(assistance.renewAssistance).mockResolvedValue({ ok: false, error: 'conflict' });
    const result = await runAssistanceTurn(
      { type: 'flow_submit', flowId: 'REN-03', data: { consent: true } },
      {
        port: assistance,
        state: { journeyId: 'REN', screenId: 'REN-03', gateApproved: true },
        sessionId: 's1',
        context: ctx,
      },
    );
    expect(result.ok && result.value.state.screenId).toBe('REN-03');
    expect(result.ok && result.value.replies[0]).toMatchObject({
      type: 'message.text',
      payload: { text: expect.stringContaining('concluir esta etapa') },
    });
    expect(result.ok && JSON.stringify(result.value.replies)).not.toContain(
      'Não foi possível continuar',
    );
  });

  it('preserves the review state and reports a specific cancellation conflict', async () => {
    const assistance = port();
    vi.mocked(assistance.cancelAssistance).mockResolvedValue({ ok: false, error: 'conflict' });
    const result = await runAssistanceTurn(
      { type: 'flow_submit', flowId: 'CAN-05', data: {} },
      {
        port: assistance,
        state: { journeyId: 'CAN', screenId: 'CAN-05', gateApproved: true },
        sessionId: 's1',
        context: ctx,
      },
    );
    expect(result.ok && result.value.state.screenId).toBe('CAN-05');
    expect(result.ok && JSON.stringify(result.value.replies)).not.toContain(
      'Não foi possível continuar',
    );
  });

  it.each([
    ['CAD-03', 'updateAddress', 'CAD-03'],
    ['FUN-06', 'requestFuneralAssistance', 'FUN-06'],
  ] as const)(
    'preserves %s when its dedicated operation fails',
    async (screenId, method, expectedScreen) => {
      const assistance = port();
      vi.mocked(assistance[method]).mockResolvedValue({ ok: false, error: 'unavailable' });
      const result = await runAssistanceTurn(
        { type: 'flow_submit', flowId: screenId, data: {} },
        {
          port: assistance,
          state: {
            journeyId: screenId.slice(0, 3),
            screenId,
            gateApproved: true,
            temporaryData:
              screenId === 'CAD-03'
                ? { postal: '01000-000', address: 'Rua Exemplo, 1', city: 'São Paulo/SP' }
                : { funeralCity: 'Campinas', funeralState: 'SP' },
          },
          sessionId: 's1',
          context: ctx,
        },
      );
      expect(result.ok && result.value.state.screenId).toBe(expectedScreen);
      expect(result.ok && JSON.stringify(result.value.replies)).toContain(
        'Não foi possível continuar',
      );
    },
  );

  it('does not run a personal review operation when the CPF gate is closed', async () => {
    const assistance = port();
    const result = await runAssistanceTurn(
      { type: 'flow_submit', flowId: 'CAN-05', data: {} },
      {
        port: assistance,
        state: { journeyId: 'CAN', screenId: 'CAN-05', gateApproved: false },
        sessionId: 's1',
        context: ctx,
      },
    );
    expect(assistance.cancelAssistance).not.toHaveBeenCalled();
    expect(result.ok && result.value.state.screenId).toBe('IDE-01');
    expect(result.ok && result.value.state.pendingStep).toBe('CAN-05');
  });

  it('blocks a stale personal review state before inspecting its Flow or mutating', async () => {
    const assistance = port();
    const result = await runAssistanceTurn(
      { type: 'flow_submit', flowId: 'DEP-06', data: {} },
      {
        port: assistance,
        state: {
          journeyId: 'DEP',
          screenId: 'DEP-06',
          gateApproved: false,
          temporaryData: {
            name: 'João',
            document: '12345678901',
            birth: '2010-01-01',
            relationship: 'Filho',
            phone: '11999999999',
            biologicalSex: 'Masculino',
          },
        },
        sessionId: 's1',
        context: ctx,
      },
    );
    expect(assistance.addDependent).not.toHaveBeenCalled();
    expect(assistance.getSessionSnapshot).not.toHaveBeenCalled();
    expect(result.ok && result.value.state.screenId).toBe('IDE-01');
    expect(result.ok && result.value.state.pendingStep).toBe('DEP-06');
  });
});

describe('direct dependent intake', () => {
  const run = (
    input: Parameters<typeof runAssistanceTurn>[0],
    state: Parameters<typeof runAssistanceTurn>[1]['state'],
    assistance = port(),
  ) =>
    runAssistanceTurn(input, { state, port: assistance, sessionId: 'direct-intake', context: ctx });
  it.each([false, true])(
    'asks for holder CPF only when absent: identified=%s',
    async (gateApproved) => {
      const result = await run(
        { type: 'text', text: 'Incluir dependente' },
        { journeyId: 'ENT', screenId: 'ENT-02', gateApproved },
      );
      expect(result.ok && result.value.state.screenId).toBe(gateApproved ? 'DEP-02' : 'IDE-01');
      if (!result.ok) return;
      if (!gateApproved) {
        expect(result.value.state.pendingStep).toBe('DEP-02');
        const resumed = await run({ type: 'text', text: '12345678900' }, result.value.state);
        expect(resumed.ok && resumed.value.state.screenId).toBe('DEP-02');
        expect(resumed.ok && resumed.value.state.temporaryData?.dependentIntake).toBe('true');
        expect(resumed.ok && JSON.stringify(resumed.value.replies)).not.toContain(
          'Continuar inclusão',
        );
      }
    },
  );
  it('selects a contract and lets the user complete partial chat data without sample values', async () => {
    const assistance = port();
    const selected = await run(
      { type: 'flow_submit', flowId: 'DEP-02', data: { choice: '0' } },
      {
        journeyId: 'DEP',
        screenId: 'DEP-02',
        gateApproved: true,
        temporaryData: { dependentIntake: 'true' },
      },
      assistance,
    );
    expect(selected.ok && selected.value.state.screenId).toBe('DEP-03');
    if (!selected.ok) return;
    const partial = await run(
      {
        type: 'text',
        text: 'Nome completo: Beatriz Costa; CPF: 98765432100; Data de nascimento: 12/03/2014; Parentesco: Filha',
      },
      selected.value.state,
      assistance,
    );
    expect(partial.ok && partial.value.state.screenId).toBe('DEP-03');
    expect(partial.ok && partial.value.state.temporaryData).toMatchObject({
      name: 'Beatriz Costa',
      cpf: '98765432100',
      birth: '2014-03-12',
    });
    expect(partial.ok && JSON.stringify(partial.value.replies)).toContain('Celular do dependente');
    expect(partial.ok && JSON.stringify(partial.value.replies)).toContain('Sexo biológico');
    expect(partial.ok && JSON.stringify(partial.value.replies)).not.toContain('João');
    expect(assistance.addDependent).not.toHaveBeenCalled();
    if (!partial.ok) return;
    const complete = await run(
      { type: 'text', text: 'Celular: (11) 98888-7777; Sexo biológico: Prefiro não informar' },
      partial.value.state,
      assistance,
    );
    expect(complete.ok && complete.value.state.screenId).toBe('DEP-06');
    expect(complete.ok && complete.value.state.temporaryData).toMatchObject({
      name: 'Beatriz Costa',
      phone: '11988887777',
      biologicalSex: 'Prefiro não informar',
    });
    expect(complete.ok && JSON.stringify(complete.value.replies)).toContain(
      'Recebi todos os dados',
    );
    expect(complete.ok && JSON.stringify(complete.value.replies)).not.toContain('98765432100');
    expect(assistance.addDependent).not.toHaveBeenCalled();
    if (!complete.ok) return;
    await run(
      { type: 'flow_submit', flowId: 'DEP-06', data: {} },
      complete.value.state,
      assistance,
    );
    expect(assistance.addDependent).toHaveBeenCalledTimes(1);
  });
  it('opens the form directly with partial chat fields and never supplies sample data', async () => {
    const result = await run(
      { type: 'quick_reply', target: 'DEP-05' },
      {
        journeyId: 'DEP',
        screenId: 'DEP-03',
        gateApproved: true,
        temporaryData: { dependentIntake: 'true', name: 'Beatriz Costa', relationship: 'filha' },
      },
    );
    const flow = result.ok && result.value.replies.find((reply) => reply.type === 'message.flow');
    expect(flow && flow.type === 'message.flow' && flow.payload.flowJson.autoOpen).toBe(true);
    expect(flow && flow.type === 'message.flow' && flow.payload.initialData).toMatchObject({
      values: { name: 'Beatriz Costa', relationship: 'Filha' },
    });
  });
  it('does not move incomplete or malformed dependent forms to review', async () => {
    const result = await run(
      {
        type: 'flow_submit',
        flowId: 'DEP-05',
        data: {
          name: 'Beatriz',
          document: '123',
          birth: '2014-02-31',
          relationship: 'Filha',
          phone: '123',
          biologicalSex: 'Feminino',
        },
      },
      {
        journeyId: 'DEP',
        screenId: 'DEP-05',
        gateApproved: true,
        temporaryData: { dependentIntake: 'true' },
      },
    );
    expect(result.ok && result.value.state.screenId).toBe('DEP-05');
  });
  it('rejects invalid fields from legacy form and review states without the intake marker', async () => {
    const assistance = port();
    const fields = {
      name: 'Beatriz',
      document: '98765432100',
      birth: '2014-02-31',
      relationship: 'Filha',
      phone: '123',
      biologicalSex: 'Feminino',
    };
    for (const screenId of ['DEP-05', 'DEP-06']) {
      const result = await run(
        { type: 'flow_submit', flowId: screenId, data: screenId === 'DEP-05' ? fields : {} },
        { journeyId: 'DEP', screenId, gateApproved: true, temporaryData: fields },
        assistance,
      );
      expect(result.ok && result.value.state.screenId).toBe(screenId);
      expect(assistance.addDependent).not.toHaveBeenCalled();
    }
  });
  it('clears the previous person before the next inclusion', async () => {
    const result = await run(
      { type: 'quick_reply', target: 'DEP-03' },
      {
        journeyId: 'DEP',
        screenId: 'DEP-12',
        gateApproved: true,
        temporaryData: {
          dependentIntake: 'true',
          name: 'Beatriz',
          cpf: '98765432100',
          birth: '2014-03-12',
          relationship: 'Filha',
          phone: '11988887777',
          biologicalSex: 'Feminino',
        },
      },
    );
    expect(result.ok && result.value.state.screenId).toBe('DEP-03');
    expect(result.ok && result.value.state.temporaryData?.name).toBeUndefined();
  });
  it('shows the no-vacancy outcome instead of offering an impossible inclusion', async () => {
    const assistance = port();
    vi.mocked(assistance.listDependents).mockResolvedValue(
      ok(
        Array.from({ length: 3 }, (_, index) => ({
          id: String(index),
          name: 'Pessoa',
          cpf: '12345678900',
          birthDate: '2010-01-01',
          relationship: 'Filho',
          phone: '11999999999',
          biologicalSex: 'male' as const,
        })),
      ),
    );
    const result = await run(
      { type: 'flow_submit', flowId: 'DEP-02', data: { choice: '0' } },
      {
        journeyId: 'DEP',
        screenId: 'DEP-02',
        gateApproved: true,
        temporaryData: { dependentIntake: 'true' },
      },
      assistance,
    );
    expect(result.ok && result.value.state.screenId).toBe('DEP-25');
  });
});

describe('concise CPF entry', () => {
  it('asks objectively without help and opens contracts directly after CPF', async () => {
    const assistance = port();
    const entered = await runAssistanceTurn(
      { type: 'quick_reply', target: 'IDE-01' },
      {
        state: { journeyId: 'ENT', screenId: 'ENT-02', gateApproved: false },
        port: assistance,
        sessionId: 'cpf-ux',
        context: ctx,
      },
    );
    expect(entered.ok && entered.value.replies).toEqual([
      { type: 'message.text', payload: { text: 'Para continuar, informe seu CPF.' } },
    ]);
    if (!entered.ok) return;
    const accepted = await runAssistanceTurn(
      { type: 'text', text: '11111111111' },
      { state: entered.value.state, port: assistance, sessionId: 'cpf-ux', context: ctx },
    );
    expect(accepted.ok && accepted.value.state.screenId).toBe('CON-01');
    expect(accepted.ok && JSON.stringify(accepted.value.replies)).not.toMatch(
      /Recebi seu CPF|Tudo pronto|Continuar pedido|Pedir ajuda/,
    );
  });
  it('returns only the pending journey after valid CPF and only the error for invalid CPF', async () => {
    const assistance = port();
    const state = {
      journeyId: 'IDE',
      screenId: 'IDE-01',
      gateApproved: false,
      pendingStep: 'DEP-02',
      temporaryData: { dependentIntake: 'true' },
    };
    const rejected = await runAssistanceTurn(
      { type: 'text', text: '123' },
      { state, port: assistance, sessionId: 'cpf-ux', context: ctx },
    );
    expect(rejected.ok && JSON.stringify(rejected.value.replies)).not.toContain('Recebi seu CPF');
    const accepted = await runAssistanceTurn(
      { type: 'text', text: '11111111111' },
      { state, port: assistance, sessionId: 'cpf-ux', context: ctx },
    );
    expect(accepted.ok && accepted.value.state.screenId).toBe('DEP-02');
    expect(accepted.ok && accepted.value.replies.map((reply) => reply.type)).toEqual([
      'message.flow',
    ]);
  });
});
