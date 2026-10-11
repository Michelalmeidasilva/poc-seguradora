import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { botText, quickReplies } from '../test/fixtures';
import { initialState } from './model';
import { ChatScreen } from './ChatScreen';
import type { ChatApi } from './useChat';
import { chatReducer } from './reducer';
import { useVoiceRecorder, type VoiceRecorderOptions } from './useVoiceRecorder';

vi.mock('./useVoiceRecorder', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./useVoiceRecorder')>();
  return { ...actual, useVoiceRecorder: vi.fn(actual.useVoiceRecorder) };
});

const api = (over: Partial<ChatApi> = {}): ChatApi => ({
  state: initialState(),
  tab: 'active',
  sendText: vi.fn(),
  sendChoice: vi.fn(),
  sendVoice: vi.fn(),
  sendFlowSubmit: vi.fn(),
  resend: vi.fn(),
  canResend: vi.fn(() => true),
  takeOver: vi.fn(),
  ...over,
});

describe('ChatScreen', () => {
  it('shows the header with the assistant name and the connection state', () => {
    render(<ChatScreen chat={api({ state: { ...initialState(), connection: 'online' } })} />);
    expect(screen.getByRole('heading', { name: /assistente seguradora/i })).toBeInTheDocument();
    expect(screen.getByText(/online/i)).toBeInTheDocument();
  });

  it.each([
    ['connecting', /conectando/i],
    ['reconnecting', /reconectando/i],
    ['offline', /sem conexão/i],
  ] as const)('shows %s in the header', (connection, text) => {
    render(<ChatScreen chat={api({ state: { ...initialState(), connection } })} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('shows "digitando…" in the header while the assistant types', () => {
    render(
      <ChatScreen
        chat={api({ state: { ...initialState(), connection: 'online', typing: true } })}
      />,
    );
    expect(within(screen.getByRole('banner')).getByText(/digitando/i)).toBeInTheDocument();
  });

  it('sends the typed text', async () => {
    const chat = api();
    render(<ChatScreen chat={chat} />);
    await userEvent.type(screen.getByRole('textbox', { name: /mensagem/i }), 'oi{Enter}');
    expect(chat.sendText).toHaveBeenCalledWith('oi');
  });

  it('answers with the quick reply the user taps', async () => {
    const state = [quickReplies(1)].reduce(
      (s, e) => chatReducer(s, { type: 'server_event', event: e }),
      initialState(),
    );
    const chat = api({ state });
    render(<ChatScreen chat={chat} />);
    await userEvent.click(screen.getByRole('button', { name: 'Fazer cotação' }));
    expect(chat.sendChoice).toHaveBeenCalledWith('menu.quote', 'Fazer cotação', expect.any(String));
  });

  it('opens a Flow through the host passed in', async () => {
    const flow = {
      v: 1 as const,
      id: '00000000-0000-4000-8000-000000000044',
      seq: 1,
      sessionId: 's1',
      correlationId: 'c1',
      ts: '2026-10-10T12:00:00.000Z',
      type: 'message.flow' as const,
      payload: {
        flowId: 'cotacao',
        body: 'Preencha',
        ctaLabel: 'Começar',
        flowJson: { screens: [] },
      },
    };
    const state = chatReducer(initialState(), { type: 'server_event', event: flow });
    const openFlow = vi.fn();
    render(<ChatScreen chat={api({ state })} openFlow={openFlow} />);
    await userEvent.click(screen.getByRole('button', { name: 'Começar' }));
    expect(openFlow).toHaveBeenCalledWith(expect.objectContaining({ flowId: 'cotacao' }));
  });

  it('replaces the composer by a notice when another tab owns the chat, and lets the user take over', async () => {
    const chat = api({ tab: 'other-tab' });
    render(<ChatScreen chat={chat} />);
    expect(screen.getByText(/aberta em outra aba/i)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /usar esta aba/i }));
    expect(chat.takeOver).toHaveBeenCalled();
  });

  it('renders messages that are already in the state', () => {
    const state = chatReducer(initialState(), {
      type: 'server_event',
      event: botText(1, 'Olá! Eu sou o assistente.'),
    });
    render(<ChatScreen chat={api({ state })} />);
    expect(screen.getByText('Olá! Eu sou o assistente.')).toBeInTheDocument();
  });

  describe('voice recorder', () => {
    const fakeRecorder = () => ({
      status: 'idle' as const,
      elapsedMs: 0,
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      cancel: vi.fn(),
    });

    it('delivers an auto-stopped recording through chat.sendVoice while the tab is active', () => {
      let options: VoiceRecorderOptions | undefined;
      vi.mocked(useVoiceRecorder).mockImplementationOnce((o) => {
        options = o;
        return fakeRecorder();
      });
      const chat = api();
      render(<ChatScreen chat={chat} />);
      const blob = new Blob(['audio']);
      options?.onAutoStop?.({ blob, durationMs: 120_000 });
      expect(chat.sendVoice).toHaveBeenCalledWith(blob, 120_000);
    });

    it('cancels the recording (releasing the mic) when the tab is demoted, not while active', () => {
      const recorder = fakeRecorder();
      vi.mocked(useVoiceRecorder).mockReturnValue(recorder);
      const { rerender } = render(<ChatScreen chat={api({ tab: 'active' })} />);
      expect(recorder.cancel).not.toHaveBeenCalled();
      rerender(<ChatScreen chat={api({ tab: 'other-tab' })} />);
      expect(recorder.cancel).toHaveBeenCalledTimes(1);
      vi.mocked(useVoiceRecorder).mockReset();
    });
  });
});
