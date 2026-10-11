import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatState } from '../chat/model';
import { App } from './App';

// A two-screen Flow (inline: app/ reaches flows only through flows/index.ts).
const flowJson = {
  version: '7.0',
  screens: [
    {
      id: 'PRODUTO',
      title: 'Cotação',
      layout: {
        type: 'SingleColumnLayout',
        children: [
          {
            type: 'RadioButtonsGroup',
            name: 'produto',
            label: 'Produto',
            'data-source': [{ id: 'AUTO', title: 'Auto' }],
          },
          {
            type: 'Footer',
            label: 'Continuar',
            'on-click-action': { name: 'navigate', next: { type: 'screen', name: 'FIM' } },
          },
        ],
      },
    },
    {
      id: 'FIM',
      title: 'Fim',
      terminal: true,
      layout: {
        type: 'SingleColumnLayout',
        children: [
          { type: 'Footer', label: 'Enviar', 'on-click-action': { name: 'complete', payload: {} } },
        ],
      },
    },
  ],
};

const flowItem = {
  kind: 'bot' as const,
  id: 'b1',
  seq: 1,
  ts: '2026-10-10T12:00:00.000Z',
  event: {
    v: 1 as const,
    id: '00000000-0000-4000-8000-000000000001',
    seq: 1,
    sessionId: 's1',
    correlationId: 'c1',
    ts: '2026-10-10T12:00:00.000Z',
    type: 'message.flow' as const,
    payload: { flowId: 'cotacao', body: 'Vamos cotar.', ctaLabel: 'Começar', flowJson },
  },
};

const mock = vi.hoisted(() => ({
  items: [] as unknown[],
  tab: 'active' as 'active' | 'other-tab',
  sendFlowSubmit: (() => undefined) as (...a: unknown[]) => void,
}));

vi.mock('../chat/useChat', () => ({
  useChat: () => ({
    state: {
      items: mock.items,
      typing: false,
      connection: 'online',
      lastSeq: 0,
      seen: {},
    } as ChatState,
    tab: mock.tab,
    sendText: vi.fn(),
    sendChoice: vi.fn(),
    sendVoice: vi.fn(),
    sendFlowSubmit: (...a: unknown[]) => mock.sendFlowSubmit(...a),
    sendFlowDataExchange: vi.fn(),
    resend: vi.fn(),
    canResend: vi.fn(() => true),
    takeOver: vi.fn(),
  }),
}));

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
  window.history.replaceState(null, '', '/');
  mock.items = [];
  mock.tab = 'active';
});

describe('App', () => {
  it('renders the chat screen', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /assistente seguradora/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /mensagem/i })).toBeInTheDocument();
  });

  it('applies the theme from the query string', () => {
    window.history.replaceState(null, '', '/?theme=dark');
    render(<App />);
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('ignores an invalid theme value', () => {
    window.history.replaceState(null, '', '/?theme=neon');
    render(<App />);
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('opens the flow sheet from the flow button of a chat message and closes it', async () => {
    mock.items = [flowItem];
    const user = userEvent.setup();
    render(<App />);
    const opener = screen.getByRole('button', { name: 'Começar' });
    await user.click(opener);
    expect(screen.getByRole('dialog', { name: 'Cotação' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('reopening the same flow starts fresh', async () => {
    mock.items = [flowItem];
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Começar' }));
    await user.click(screen.getByRole('radio', { name: /Auto/ }));
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await user.click(screen.getByRole('button', { name: 'Fechar' }));
    await user.click(screen.getByRole('button', { name: 'Descartar' }));
    await user.click(screen.getByRole('button', { name: 'Começar' }));
    expect(screen.getByRole('dialog', { name: 'Cotação' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Auto/ })).not.toBeChecked();
  });

  it('closes the sheet without submitting when the tab becomes passive', async () => {
    mock.items = [flowItem];
    const submit = vi.fn();
    mock.sendFlowSubmit = submit;
    const user = userEvent.setup();
    const { rerender } = render(<App />);
    await user.click(screen.getByRole('button', { name: 'Começar' }));
    await user.click(screen.getByRole('radio', { name: /Auto/ }));
    mock.tab = 'other-tab';
    rerender(<App />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(submit).not.toHaveBeenCalled();
  });
});
