import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Bubble } from './Bubble';

describe('Bubble', () => {
  it('renders the content and the time', () => {
    render(
      <Bubble direction="in" time="12:04">
        Olá!
      </Bubble>,
    );
    expect(screen.getByText('Olá!')).toBeInTheDocument();
    expect(screen.getByText('12:04')).toBeInTheDocument();
  });

  it('shows no status for incoming bubbles', () => {
    render(
      <Bubble direction="in" time="12:04" status="sent">
        x
      </Bubble>,
    );
    expect(screen.queryByRole('img')).toBeNull();
  });

  it.each([
    ['sending', 'Enviando'],
    ['sent', 'Enviada'],
    ['delivered', 'Entregue'],
    ['failed', 'Falha no envio'],
  ] as const)('labels the %s status for outgoing bubbles', (status, label) => {
    render(
      <Bubble direction="out" time="12:04" status={status}>
        x
      </Bubble>,
    );
    expect(screen.getByRole('img', { name: label })).toBeInTheDocument();
  });

  it('marks the direction and the tail with classes', () => {
    const { container } = render(
      <Bubble direction="out" time="12:04" tail={false}>
        x
      </Bubble>,
    );
    const bubble = container.querySelector('.bubble');
    expect(bubble).toHaveClass('bubble--out');
    expect(bubble).not.toHaveClass('bubble--tail');
  });

  it('exposes an accessible label when given', () => {
    render(
      <Bubble direction="in" time="12:04" label="Mensagem do assistente">
        x
      </Bubble>,
    );
    expect(screen.getByRole('group', { name: 'Mensagem do assistente' })).toBeInTheDocument();
  });
});
