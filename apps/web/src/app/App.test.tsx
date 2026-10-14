import { render, screen, within } from '@testing-library/react';
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
  sendText: vi.fn(),
  sessionId: undefined as string | undefined,
  hasPendingSend: false,
  sendFlowSubmit: (() => undefined) as (...a: unknown[]) => void,
}));

vi.mock('../chat/useChat', () => ({
  useChat: () => ({
    state: {
      items: mock.items,
      typing: false,
      connection: 'online',
      lastSeq: 0,
      sessionId: mock.sessionId,
      seen: {},
    } as ChatState,
    tab: mock.tab,
    hasPendingSend: mock.hasPendingSend,
    sendText: mock.sendText,
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
  mock.sendText.mockClear();
  mock.sessionId = undefined;
  mock.hasPendingSend = false;
});

describe('App', () => {
  it('switches previews without clearing the conversation or composer draft', async () => {
    mock.items = [flowItem];
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByRole('textbox', { name: 'Mensagem' }), 'Meu pedido');
    await user.click(screen.getByRole('button', { name: 'Android' }));
    await user.click(screen.getByRole('tab', { name: 'Catálogo' }));
    expect(screen.queryByRole('textbox', { name: 'Mensagem' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Catálogo' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Desktop' }));
    await user.click(screen.getByRole('tab', { name: 'Conversa' }));
    expect(screen.getByRole('textbox', { name: 'Mensagem' })).toHaveValue('Meu pedido');
    expect(screen.getByRole('button', { name: 'Começar' })).toBeInTheDocument();
  });

  it('opens catalog forms locally without submitting them to the chat transport', async () => {
    const submit = vi.fn();
    mock.sendFlowSubmit = submit;
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('tab', { name: 'Catálogo' }));
    await user.click(screen.getByRole('button', { name: 'Abrir formulário' }));
    const dialog = screen.getByRole('dialog', { name: 'Solicitar assistência' });
    await user.type(
      within(dialog).getByRole('textbox', { name: /Nome completo/ }),
      'Pessoa de exemplo',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Concluir exemplo' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByRole('status', { name: 'Resultado do exemplo' })).toHaveTextContent(
      'Exemplo concluído',
    );
  });

  it('provides light, dark and system theme selection', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Escuro' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    await user.click(screen.getByRole('button', { name: 'Claro' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    await user.click(screen.getByRole('button', { name: 'Sistema' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(screen.getByRole('button', { name: 'Sistema' })).toHaveAttribute('aria-pressed', 'true');
  });
  it('renders the chat screen', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /digio assistências/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /mensagem/i })).toBeInTheDocument();
  });

  it('applies the theme from the query string', () => {
    window.history.replaceState(null, '', '/?theme=dark');
    render(<App />);
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('uses the system theme when the query value is invalid', () => {
    window.history.replaceState(null, '', '/?theme=neon');
    render(<App />);
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('starts an empty active conversation once when the connection is online', () => {
    const { rerender } = render(<App />);
    rerender(<App />);
    expect(mock.sendText).toHaveBeenCalledTimes(1);
    expect(mock.sendText).toHaveBeenCalledWith('Oi');
  });

  it('does not restart restored conversations or a conversation owned by another tab', () => {
    mock.items = [flowItem];
    const { unmount } = render(<App />);
    expect(mock.sendText).not.toHaveBeenCalled();
    unmount();
    mock.items = [];
    mock.tab = 'other-tab';
    render(<App />);
    expect(mock.sendText).not.toHaveBeenCalled();
  });

  it('replaces an obsolete main menu after the backend session has reset', () => {
    mock.items = [
      {
        ...flowItem,
        event: {
          ...flowItem.event,
          type: 'message.quick_replies',
          payload: {
            text: 'Escolha uma opção:',
            options: [
              { id: 'menu.quote', title: 'Fazer cotação' },
              { id: 'menu.policies', title: 'Minhas apólices' },
              { id: 'menu.claim', title: 'Abrir sinistro' },
            ],
          },
        },
      },
    ];
    render(<App />);
    expect(mock.sendText).toHaveBeenCalledWith('Oi');
  });

  it('starts the assistance welcome again when its previous backend session has reset', () => {
    mock.items = [
      {
        ...flowItem,
        event: {
          ...flowItem.event,
          type: 'message.quick_replies',
          payload: {
            text: 'Como posso ajudar?',
            options: [{ id: 'DES-01', title: 'Conhecer produtos' }],
          },
        },
      },
      {
        kind: 'notice',
        id: 'reset-2026-10-13',
        ts: '2026-10-13T12:00:00.000Z',
        tone: 'info',
        text: 'Uma nova conversa foi iniciada.',
      },
    ];
    render(<App />);
    expect(mock.sendText).toHaveBeenCalledWith('Oi');
  });

  it.each(['sending', 'sent'])(
    'does not duplicate a greeting already being replayed after reset (%s)',
    (status) => {
      mock.sessionId = 'initial-session';
      const { rerender } = render(<App />);
      mock.items = [
        {
          kind: 'user',
          id: 'greeting-in-flight',
          ts: '2026-10-13T12:00:00.000Z',
          status,
          content: { type: 'text', text: 'Oi' },
        },
        {
          kind: 'notice',
          id: 'reset-2026-10-13',
          ts: '2026-10-13T12:00:00.000Z',
          tone: 'info',
          text: 'Uma nova conversa foi iniciada.',
        },
      ];
      mock.sessionId = 'recovered-session';
      mock.hasPendingSend = true;
      rerender(<App />);
      expect(mock.sendText).toHaveBeenCalledTimes(1);
    },
  );

  it('does not mistake a restored sent message for an active transport replay', () => {
    mock.items = [
      {
        kind: 'user',
        id: 'historical-greeting',
        ts: '2026-10-13T12:00:00.000Z',
        status: 'sent',
        content: { type: 'text', text: 'Oi' },
      },
      {
        kind: 'notice',
        id: 'reset-2026-10-13',
        ts: '2026-10-13T12:00:00.000Z',
        tone: 'info',
        text: 'Uma nova conversa foi iniciada.',
      },
    ];
    render(<App />);
    expect(mock.sendText).toHaveBeenCalledWith('Oi');
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
