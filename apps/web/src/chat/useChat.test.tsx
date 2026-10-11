import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import type { ServerEvent } from '@seguradora/protocol';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatClientOptions, Draft } from '../transport/chat-client';
import { botText, delivered, errorEvent, uuid } from '../test/fixtures';
import { useChat } from './useChat';

beforeEach(() => sessionStorage.clear());

function fakeClient() {
  const sent: Draft[] = [];
  const resent: string[] = [];
  let started: { sessionId: string; lastSeq: number } | undefined | 'fresh';
  let options!: ChatClientOptions;
  let n = 0;
  return {
    sent,
    resent,
    started: () => started,
    emit: (e: ServerEvent) => options.onServerEvent(e),
    options: () => options,
    create: (o: ChatClientOptions) => {
      options = o;
      return {
        async start(initial?: { sessionId: string; lastSeq: number }) {
          started = initial ?? 'fresh';
          o.onSession(initial?.sessionId ?? 'sess-new', initial ? 'resumed' : 'new');
        },
        stop: vi.fn(),
        send(draft: Draft) {
          sent.push(draft);
          return uuid(2000 + ++n);
        },
        resend(id: string) {
          resent.push(id);
        },
        sessionId: 'sess-new',
      };
    },
  };
}

const activeGuard = () => ({
  status: () => 'active' as const,
  subscribe: (fn: (s: 'active' | 'other-tab') => void) => {
    fn('active');
    return () => undefined;
  },
  takeOver: vi.fn(),
  dispose: vi.fn(),
});

describe('useChat', () => {
  it('starts a fresh client and shows the messages that arrive', async () => {
    const f = fakeClient();
    const { result } = renderHook(() => useChat({ createClient: f.create, guard: activeGuard() }));
    await act(async () => {});
    expect(f.started()).toBe('fresh');
    act(() => f.emit(botText(1, 'oi')));
    expect(result.current.state.items).toHaveLength(1);
    expect(result.current.state.sessionId).toBe('sess-new');
  });

  it('sends text, quick replies and flow submissions and queues the user bubble', async () => {
    const f = fakeClient();
    const { result } = renderHook(() => useChat({ createClient: f.create, guard: activeGuard() }));
    await act(async () => {});
    act(() => result.current.sendText('  olá  '));
    act(() => result.current.sendChoice('menu.quote', 'Fazer cotação', uuid(7)));
    act(() => result.current.sendFlowSubmit('cotacao', { nome: 'x' }, 'Cotação enviada'));
    expect(f.sent.map((d) => d.type)).toEqual([
      'user.text',
      'user.quick_reply',
      'user.flow_submit',
    ]);
    expect(f.sent[0]).toMatchObject({ payload: { text: 'olá' } });
    const users = result.current.state.items.filter((i) => i.kind === 'user');
    expect(users.map((u) => u.content.type)).toEqual(['text', 'quick_reply', 'flow_submit']);
    expect(users.every((u) => u.status === 'sending')).toBe(true);
  });

  it('does not send blank text', async () => {
    const f = fakeClient();
    const { result } = renderHook(() => useChat({ createClient: f.create, guard: activeGuard() }));
    await act(async () => {});
    act(() => result.current.sendText('   '));
    expect(f.sent).toHaveLength(0);
  });

  it('sends a voice message with a local media id and keeps the blob URL for playback', async () => {
    const f = fakeClient();
    const create = vi.fn(() => 'blob:http://localhost/voice-1');
    const original = URL.createObjectURL;
    URL.createObjectURL = create;
    const { result } = renderHook(() => useChat({ createClient: f.create, guard: activeGuard() }));
    await act(async () => {});
    act(() => result.current.sendVoice(new Blob(['x'], { type: 'audio/webm' }), 4200));
    URL.createObjectURL = original;
    expect(f.sent[0]).toMatchObject({ type: 'user.voice', payload: { durationMs: 4200 } });
    const mediaId = (f.sent[0] as Extract<Draft, { type: 'user.voice' }>).payload.mediaId;
    expect(mediaId).toMatch(/^local-/);
    const item = result.current.state.items.find((i) => i.kind === 'user');
    expect(item).toMatchObject({
      content: { type: 'voice', durationMs: 4200, objectUrl: 'blob:http://localhost/voice-1' },
    });
  });

  it('applies outgoing status updates from the client', async () => {
    const f = fakeClient();
    const { result } = renderHook(() => useChat({ createClient: f.create, guard: activeGuard() }));
    await act(async () => {});
    act(() => result.current.sendText('oi'));
    const id = result.current.state.items.find((i) => i.kind === 'user')?.id ?? '';
    act(() => f.options().onOutgoing(id, 'sent'));
    expect(result.current.state.items[0]).toMatchObject({ status: 'sent' });
    act(() => f.emit(delivered(1, id)));
    expect(result.current.state.items[0]).toMatchObject({ status: 'delivered' });
    act(() => f.emit(errorEvent(2, 'upstream_unavailable', id)));
    expect(result.current.state.items[0]).toMatchObject({ status: 'failed' });
  });

  it('resend() asks the client to resend the same id', async () => {
    const f = fakeClient();
    const { result } = renderHook(() => useChat({ createClient: f.create, guard: activeGuard() }));
    await act(async () => {});
    act(() => result.current.sendText('oi'));
    const id = result.current.state.items.find((i) => i.kind === 'user')?.id ?? '';
    act(() => result.current.resend(id));
    expect(f.resent).toEqual([id]);
  });

  it('restores the saved history and resumes the saved session', async () => {
    const first = fakeClient();
    const a = renderHook(() => useChat({ createClient: first.create, guard: activeGuard() }));
    await act(async () => {});
    act(() => first.emit(botText(1, 'oi')));
    act(() => first.emit(botText(2, 'tudo bem?')));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
    a.unmount();

    const second = fakeClient();
    const b = renderHook(() => useChat({ createClient: second.create, guard: activeGuard() }));
    await act(async () => {});
    expect(second.started()).toEqual({ sessionId: 'sess-new', lastSeq: 2 });
    expect(b.result.current.state.items).toHaveLength(2);
  });

  it('shows a notice and clears the seq when the session is reset', async () => {
    const f = fakeClient();
    const { result } = renderHook(() => useChat({ createClient: f.create, guard: activeGuard() }));
    await act(async () => {});
    act(() => f.emit(botText(1)));
    act(() => f.options().onSessionReset());
    expect(result.current.state.lastSeq).toBe(0);
    expect(result.current.state.items.at(-1)).toMatchObject({ kind: 'notice' });
  });

  it('does not start the client while another tab owns the chat', async () => {
    const f = fakeClient();
    const guard = {
      status: () => 'other-tab' as const,
      subscribe: (fn: (s: 'active' | 'other-tab') => void) => {
        fn('other-tab');
        return () => undefined;
      },
      takeOver: vi.fn(),
      dispose: vi.fn(),
    };
    const { result } = renderHook(() => useChat({ createClient: f.create, guard }));
    await act(async () => {});
    expect(f.started()).toBeUndefined();
    expect(result.current.tab).toBe('other-tab');
    act(() => result.current.takeOver());
    expect(guard.takeOver).toHaveBeenCalled();
  });

  it('maps the client connection state', async () => {
    const f = fakeClient();
    const { result } = renderHook(() => useChat({ createClient: f.create, guard: activeGuard() }));
    await act(async () => {});
    act(() => f.options().onConnection('reconnecting'));
    expect(result.current.state.connection).toBe('reconnecting');
  });

  it('starts exactly one client under StrictMode double effects', async () => {
    const instances: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[] = [];
    const create = vi.fn((o: ChatClientOptions) => {
      const c = {
        start: vi.fn(async () => o.onSession('sess-new', 'new')),
        stop: vi.fn(),
        send: vi.fn(() => uuid(1)),
        resend: vi.fn(),
      };
      instances.push(c);
      return c;
    });
    renderHook(() => useChat({ createClient: create, guard: activeGuard() }), {
      wrapper: StrictMode,
    });
    await act(async () => {});
    expect(instances.filter((c) => c.start.mock.calls.length > 0)).toHaveLength(1);
    expect(instances.reduce((n, c) => n + c.start.mock.calls.length, 0)).toBe(1);
  });
});
