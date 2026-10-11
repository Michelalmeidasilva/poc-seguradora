import type { ServerEvent } from '@seguradora/protocol';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { BotItem } from '../chat/model';
import { botText, uuid } from '../test/fixtures';
import { renderBotMessage, type RenderContext } from './registry';

const item = (event: ServerEvent): BotItem => ({
  kind: 'bot',
  id: event.id,
  seq: event.seq,
  ts: event.ts,
  event: event as BotItem['event'],
});

const ctx = (over: Partial<RenderContext> = {}): RenderContext => ({
  interactive: true,
  sendChoice: vi.fn(),
  openFlow: vi.fn(),
  ...over,
});

const base = {
  v: 1 as const,
  sessionId: 's1',
  correlationId: 'c1',
  ts: '2026-10-10T12:00:00.000Z',
};

describe('renderBotMessage', () => {
  it('renders a text message in an incoming bubble with its time', () => {
    const { container } = render(<>{renderBotMessage(item(botText(1, '*oi*')), ctx())}</>);
    expect(container.querySelector('.bubble--in')).not.toBeNull();
    expect(container.querySelector('strong')).toHaveTextContent('oi');
  });

  it('renders quick replies and forwards the choice with the id of the message', async () => {
    const sendChoice = vi.fn();
    const event: ServerEvent = {
      ...base,
      id: uuid(2),
      seq: 2,
      type: 'message.quick_replies',
      payload: { text: 'Escolha', options: [{ id: 'menu.quote', title: 'Fazer cotação' }] },
    };
    render(<>{renderBotMessage(item(event), ctx({ sendChoice }))}</>);
    await userEvent.click(screen.getByRole('button', { name: 'Fazer cotação' }));
    expect(sendChoice).toHaveBeenCalledWith('menu.quote', 'Fazer cotação', uuid(2));
  });

  it('renders a code, a location and a voice message', () => {
    const code: ServerEvent = {
      ...base,
      id: uuid(3),
      seq: 3,
      type: 'message.code',
      payload: { code: 'Protocolo: SN-2002' },
    };
    const location: ServerEvent = {
      ...base,
      id: uuid(4),
      seq: 4,
      type: 'message.location',
      payload: { latitude: -23.5, longitude: -46.6, name: 'Agência' },
    };
    const voice: ServerEvent = {
      ...base,
      id: uuid(5),
      seq: 5,
      type: 'message.voice',
      payload: { mediaUrl: 'https://exemplo.invalid/a.ogg', durationMs: 4000 },
    };
    render(
      <>
        {renderBotMessage(item(code), ctx())}
        {renderBotMessage(item(location), ctx())}
        {renderBotMessage(item(voice), ctx())}
      </>,
    );
    expect(screen.getByText('Protocolo: SN-2002')).toBeInTheDocument();
    expect(screen.getByText('Agência')).toBeInTheDocument();
    expect(screen.getByText('0:04')).toBeInTheDocument();
  });

  it('renders a template, a carousel and a flow message', () => {
    const template: ServerEvent = {
      ...base,
      id: uuid(6),
      seq: 6,
      type: 'message.template',
      payload: { header: 'Cotação CT-3001', body: 'Prêmio mensal: R$ 189,90', buttons: [] },
    };
    const carousel: ServerEvent = {
      ...base,
      id: uuid(7),
      seq: 7,
      type: 'message.carousel',
      payload: {
        cards: [
          {
            mediaUrl: 'https://exemplo.invalid/1.png',
            mediaType: 'image',
            title: 'Colisão',
            buttons: [],
          },
          {
            mediaUrl: 'https://exemplo.invalid/2.png',
            mediaType: 'image',
            title: 'Roubo',
            buttons: [],
          },
        ],
      },
    };
    const flow: ServerEvent = {
      ...base,
      id: uuid(8),
      seq: 8,
      type: 'message.flow',
      payload: {
        flowId: 'cotacao',
        body: 'Preencha',
        ctaLabel: 'Começar',
        flowJson: { screens: [] },
      },
    };
    render(
      <>
        {renderBotMessage(item(template), ctx())}
        {renderBotMessage(item(carousel), ctx())}
        {renderBotMessage(item(flow), ctx())}
      </>,
    );
    expect(screen.getByText('Cotação CT-3001')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /carrossel/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Começar' })).toBeInTheDocument();
  });

  it('never plays a blob: URL coming from the server path', () => {
    const voice = {
      kind: 'bot',
      id: uuid(9),
      seq: 9,
      ts: base.ts,
      event: {
        ...base,
        id: uuid(9),
        seq: 9,
        type: 'message.voice',
        payload: { mediaUrl: 'blob:http://localhost/x', durationMs: 4000 },
      },
    } as BotItem;
    const { container } = render(<>{renderBotMessage(voice, ctx())}</>);
    expect(container.querySelector('audio')).toBeNull();
  });
});
