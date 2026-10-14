import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { botText, quickReplies, uuid } from '../test/fixtures';
import { initialState, type ChatState, type UserItem } from './model';
import { MessageList } from './MessageList';
import { chatReducer } from './reducer';

const ctx = () => ({
  sendChoice: vi.fn(),
  openFlow: vi.fn(),
  resend: vi.fn(),
  canResend: vi.fn(() => true),
});
const user = (
  n: number,
  status: UserItem['status'] = 'sent',
  ts = '2026-10-10T12:00:00.000Z',
): UserItem => ({
  kind: 'user',
  id: uuid(1000 + n),
  ts,
  status,
  content: { type: 'text', text: `u${n}` },
});
const build = (...actions: Parameters<typeof chatReducer>[1][]): ChatState =>
  actions.reduce(chatReducer, initialState());

describe('MessageList', () => {
  it('does not merge adjacent messages belonging to different turns', () => {
    const text = botText(1, 'Mensagem anterior.');
    const choices = {
      ...quickReplies(2),
      type: 'message.quick_replies' as const,
      correlationId: 'another-turn',
      payload: {
        text: 'Escolha uma opção para continuar.',
        options: [{ id: 'DES-01', title: 'Conhecer produtos' }],
      },
    };
    const { container } = render(
      <MessageList
        state={build(
          { type: 'server_event', event: text },
          { type: 'server_event', event: choices },
        )}
        {...ctx()}
      />,
    );
    expect(container.querySelectorAll('.bubble--in')).toHaveLength(2);
    expect(screen.getByText('Escolha uma opção para continuar.')).toBeInTheDocument();
  });
  it('keeps assistance text and its quick replies in one bubble while replying to the actual option event', async () => {
    const text = botText(1, 'Posso ajudar com os três serviços.');
    const choices = {
      ...quickReplies(2),
      type: 'message.quick_replies' as const,
      correlationId: text.correlationId,
      payload: {
        text: 'Escolha uma opção para continuar.',
        options: [{ id: 'DES-01', title: 'Conhecer produtos' }],
      },
    };
    const state = build(
      { type: 'server_event', event: text },
      { type: 'server_event', event: choices },
    );
    const context = ctx();
    const { container } = render(<MessageList state={state} {...context} />);
    expect(container.querySelectorAll('.bubble--in')).toHaveLength(1);
    expect(
      screen.getByText('Posso ajudar com os três serviços.').closest('.bubble'),
    ).toContainElement(screen.getByRole('button', { name: 'Conhecer produtos' }));
    expect(screen.queryByText('Escolha uma opção para continuar.')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Conhecer produtos' }));
    expect(context.sendChoice).toHaveBeenCalledWith('DES-01', 'Conhecer produtos', choices.id);
  });
  it('is a live log region', () => {
    render(<MessageList state={initialState()} {...ctx()} />);
    const log = screen.getByRole('log', { name: /conversa/i });
    expect(log).toHaveAttribute('aria-live', 'polite');
    expect(log).toHaveAttribute('aria-relevant', 'additions');
  });

  it('renders bot and user messages in order', () => {
    const state = build(
      { type: 'server_event', event: botText(1, 'olá') },
      { type: 'user_queued', item: user(1) },
    );
    render(<MessageList state={state} {...ctx()} />);
    const texts = screen.getAllByText(/olá|u1/).map((e) => e.textContent);
    expect(texts).toEqual(['olá', 'u1']);
  });

  it('shows a date separator when the day changes', () => {
    const state = build(
      { type: 'user_queued', item: user(1, 'sent', '2026-10-09T12:00:00.000Z') },
      { type: 'user_queued', item: user(2, 'sent', '2026-10-10T12:00:00.000Z') },
    );
    render(
      <MessageList
        state={state}
        now={new Date('2026-10-10T15:00:00.000Z')}
        timeZone="UTC"
        {...ctx()}
      />,
    );
    expect(screen.getByText('Ontem')).toBeInTheDocument();
    expect(screen.getByText('Hoje')).toBeInTheDocument();
  });

  it('shows the typing indicator only while the assistant types', () => {
    const state = { ...build({ type: 'server_event', event: botText(1) }), typing: true };
    const { rerender } = render(<MessageList state={state} {...ctx()} />);
    expect(screen.getByRole('status', { name: /digitando/i })).toBeInTheDocument();
    rerender(<MessageList state={{ ...state, typing: false }} {...ctx()} />);
    expect(screen.queryByRole('status', { name: /digitando/i })).toBeNull();
  });

  it('shows a retry button on a failed message and resends it', async () => {
    const c = ctx();
    const state = build({ type: 'user_queued', item: user(1, 'failed') });
    render(<MessageList state={state} {...c} />);
    await userEvent.click(screen.getByRole('button', { name: /tentar de novo/i }));
    expect(c.resend).toHaveBeenCalledWith(uuid(1001));
  });

  it('hides the retry button of a failed message that cannot be rebuilt', () => {
    const c = { ...ctx(), canResend: vi.fn(() => false) };
    const state = build({ type: 'user_queued', item: user(1, 'failed') });
    render(<MessageList state={state} {...c} />);
    expect(c.canResend).toHaveBeenCalledWith(uuid(1001));
    expect(screen.queryByRole('button', { name: /tentar de novo/i })).toBeNull();
  });

  it('does not show a retry button for messages that were sent', () => {
    const state = build({ type: 'user_queued', item: user(1, 'delivered') });
    render(<MessageList state={state} {...ctx()} />);
    expect(screen.queryByRole('button', { name: /tentar de novo/i })).toBeNull();
  });

  it('keeps only the last bot message interactive', async () => {
    const c = ctx();
    const state = build(
      { type: 'server_event', event: quickReplies(1) },
      { type: 'server_event', event: quickReplies(2) },
    );
    render(<MessageList state={state} {...c} />);
    const buttons = screen.getAllByRole('button', { name: 'Fazer cotação' });
    expect(buttons[0]).toBeDisabled();
    expect(buttons[1]).toBeEnabled();
    await userEvent.click(buttons[1] as HTMLElement);
    expect(c.sendChoice).toHaveBeenCalledWith('menu.quote', 'Fazer cotação', uuid(2));
  });

  it('renders user quick replies, voice and flow submissions as their own bubbles', () => {
    const state = build(
      {
        type: 'user_queued',
        item: {
          ...user(1),
          content: { type: 'quick_reply', optionId: 'menu.quote', title: 'Fazer cotação' },
        },
      },
      {
        type: 'user_queued',
        item: {
          ...user(2),
          content: { type: 'voice', durationMs: 4200, objectUrl: 'blob:http://x/1' },
        },
      },
      {
        type: 'user_queued',
        item: {
          ...user(3),
          content: { type: 'flow_submit', flowId: 'cotacao', summary: 'Cotação enviada' },
        },
      },
    );
    render(<MessageList state={state} {...ctx()} />);
    expect(screen.getByText('Fazer cotação')).toBeInTheDocument();
    expect(screen.getByText('0:04')).toBeInTheDocument();
    expect(screen.getByText('Cotação enviada')).toBeInTheDocument();
  });

  it('renders notices', () => {
    const state = build({ type: 'session_reset', ts: '2026-10-10T12:00:00.000Z' });
    render(<MessageList state={state} {...ctx()} />);
    expect(screen.getByText(/nova conversa/i)).toBeInTheDocument();
  });
});
