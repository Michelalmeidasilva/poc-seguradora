import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

vi.mock('../chat/useChat', () => ({
  useChat: () => ({
    state: { items: [], typing: false, connection: 'online', lastSeq: 0, seen: {} },
    tab: 'active',
    sendText: vi.fn(),
    sendChoice: vi.fn(),
    sendVoice: vi.fn(),
    sendFlowSubmit: vi.fn(),
    resend: vi.fn(),
    takeOver: vi.fn(),
  }),
}));

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
  window.history.replaceState(null, '', '/');
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
});
