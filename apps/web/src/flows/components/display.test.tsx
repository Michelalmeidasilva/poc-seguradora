import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { flowOf, renderInFlow } from '../test-utils';
import { Layout } from './Layout';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const show = (children: unknown[], runAction = vi.fn()) =>
  renderInFlow(<Layout />, flowOf(children), { runAction });

describe('Image', () => {
  it('renders https and base64 png sources with alt text and clamped size', () => {
    show([
      { type: 'Image', src: 'https://x.test/a.png', 'alt-text': 'A', width: 99999, height: 40 },
      { type: 'Image', src: PNG, 'alt-text': 'B', 'scale-type': 'cover' },
    ]);
    const a = screen.getByAltText('A') as HTMLImageElement;
    expect(a.src).toBe('https://x.test/a.png');
    expect(Number(a.style.width.replace('px', ''))).toBeLessThanOrEqual(2000);
    expect(screen.getByAltText('B')).toHaveStyle({ objectFit: 'cover' });
  });

  it.each([
    'javascript:alert(1)',
    'file:///etc/passwd',
    'data:image/svg+xml;base64,PHN2Zz4=',
    'data:text/html;base64,PGI+',
    'data:image/png;base64,@@@<script>',
    'ftp://x.test/a.png',
  ])('renders nothing for %s', (src) => {
    const { container } = show([{ type: 'Image', src, 'alt-text': 'X' }]);
    expect(container.querySelector('img')).toBeNull();
  });
});

describe('EmbeddedLink', () => {
  it('is a button that runs its raw action once', async () => {
    const runAction = vi.fn();
    const action = { name: 'open_url', url: 'https://x.test' };
    show([{ type: 'EmbeddedLink', text: 'Termos', 'on-click-action': action }], runAction);
    await userEvent.click(screen.getByRole('button', { name: 'Termos' }));
    expect(runAction).toHaveBeenCalledTimes(1);
    expect(runAction).toHaveBeenCalledWith(action);
  });
});

describe('ImageCarousel', () => {
  const images = [
    { src: 'https://x.test/1.png', 'alt-text': 'um' },
    { src: 'https://x.test/2.png', 'alt-text': 'dois' },
    { src: 'javascript:alert(1)', 'alt-text': 'ruim' },
    { src: 'https://x.test/3.png', 'alt-text': 'tres' },
  ];

  it('navigates with buttons over valid images only', async () => {
    show([{ type: 'ImageCarousel', images }]);
    const region = screen.getByRole('group', { name: /carrossel/i });
    expect(region).toHaveAttribute('aria-roledescription', 'carousel');
    expect(screen.getByAltText('um')).toBeInTheDocument();
    expect(screen.getByText('1 de 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /anterior/i })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: /próxim/i }));
    expect(screen.getByAltText('dois')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /próxim/i }));
    expect(screen.getByAltText('tres')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /próxim/i })).toBeDisabled();
  });

  it('supports ArrowLeft/ArrowRight on the focused carousel', () => {
    show([{ type: 'ImageCarousel', images }]);
    const region = screen.getByRole('group', { name: /carrossel/i });
    fireEvent.keyDown(region, { key: 'ArrowRight' });
    expect(screen.getByAltText('dois')).toBeInTheDocument();
    fireEvent.keyDown(region, { key: 'ArrowLeft' });
    expect(screen.getByAltText('um')).toBeInTheDocument();
    fireEvent.keyDown(region, { key: 'ArrowLeft' });
    expect(screen.getByAltText('um')).toBeInTheDocument();
  });

  it('limits to 10 images', () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ src: `https://x.test/${i}.png` }));
    show([{ type: 'ImageCarousel', images: many }]);
    expect(screen.getByText('1 de 10')).toBeInTheDocument();
  });
});

describe('NavigationList', () => {
  const nav = { name: 'navigate', next: { type: 'screen', name: 'B' }, payload: { id: 'x' } };
  it('renders items as buttons and runs the item action', async () => {
    const runAction = vi.fn();
    show(
      [
        {
          type: 'NavigationList',
          name: 'nav',
          'list-items': [
            {
              id: 'a',
              'main-content': { title: 'Apólice', description: 'Auto', metadata: 'm' },
              end: { title: 'R$ 10', description: 'd', metadata: 'e' },
              start: { image: PNG, 'alt-text': 'ic' },
              badge: 'Novo',
              tags: ['t1', 't2'],
              'on-click-action': nav,
            },
            { id: 'a', 'main-content': { title: 'Dup' }, 'on-click-action': { name: 'complete' } },
          ],
        },
      ],
      runAction,
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Novo')).toBeInTheDocument();
    expect(screen.getByText('t2')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Apólice/ }));
    expect(runAction).toHaveBeenCalledWith(nav);
    await userEvent.click(screen.getByRole('button', { name: /Dup/ }));
    expect(runAction).toHaveBeenLastCalledWith({ name: 'complete' });
  });
});

describe('ChipsSelector', () => {
  const onSelect = { name: 'update_data', payload: { picked: 'yes' } };
  const onUnselect = { name: 'update_data', payload: { picked: 'no' } };
  const chips = (extra: Record<string, unknown> = {}) => ({
    type: 'ChipsSelector',
    name: 'tags',
    label: 'Coberturas',
    'data-source': [
      { id: 'a', title: 'Roubo' },
      { id: 'b', title: 'Incêndio' },
      { id: 'c', title: 'Vidros' },
    ],
    'on-select-action': onSelect,
    'on-unselect-action': onUnselect,
    ...extra,
  });

  it('toggles chips, stores ids and runs select/unselect actions', async () => {
    const runAction = vi.fn();
    show([chips()], runAction);
    const group = screen.getByRole('group', { name: 'Coberturas' });
    expect(group).toBeInTheDocument();
    const roubo = screen.getByRole('button', { name: 'Roubo' });
    expect(roubo).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(roubo);
    expect(roubo).toHaveAttribute('aria-pressed', 'true');
    expect(runAction).toHaveBeenLastCalledWith(onSelect, { name: 'tags', event: 'select' });
    await userEvent.click(roubo);
    expect(roubo).toHaveAttribute('aria-pressed', 'false');
    expect(runAction).toHaveBeenLastCalledWith(onUnselect, { name: 'tags', event: 'unselect' });
    expect(runAction).toHaveBeenCalledTimes(2);
  });

  it('blocks selecting beyond max-selected-items', async () => {
    const runAction = vi.fn();
    show([chips({ 'max-selected-items': 1 })], runAction);
    await userEvent.click(screen.getByRole('button', { name: 'Roubo' }));
    expect(screen.getByRole('button', { name: 'Incêndio' })).toBeDisabled();
    expect(runAction).toHaveBeenCalledTimes(1);
  });

  it('shows min-selected-items error after touch', async () => {
    show([chips({ 'min-selected-items': 2 })]);
    const b = screen.getByRole('button', { name: 'Roubo' });
    await userEvent.click(b);
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    expect(screen.getByText(/pelo menos 2/)).toBeInTheDocument();
  });
});

describe('If / Switch', () => {
  const body = (text: string) => ({ type: 'TextBody', text });
  it('renders the right branch through 3 nested levels', () => {
    show([
      {
        type: 'If',
        condition: '${data.a}',
        then: [
          {
            type: 'If',
            condition: '${data.b}',
            then: [
              {
                type: 'If',
                condition: '${data.c}',
                then: [body('deep-then')],
                else: [body('deep-else')],
              },
            ],
            else: [body('mid-else')],
          },
        ],
        else: [body('top-else')],
      },
    ]);
    // data is empty: falsy at the first level
    expect(screen.getByText('top-else')).toBeInTheDocument();
  });

  it('nested true/true/false picks the innermost else', () => {
    renderInFlow(
      <Layout />,
      flowOf([
        {
          type: 'If',
          condition: '${data.a}',
          then: [
            {
              type: 'If',
              condition: '${data.b}',
              then: [
                {
                  type: 'If',
                  condition: '${data.c}',
                  then: [body('deep-then')],
                  else: [body('deep-else')],
                },
              ],
            },
          ],
        },
      ]),
      { data: { a: true, b: true, c: false } },
    );
    expect(screen.getByText('deep-else')).toBeInTheDocument();
    expect(screen.queryByText('deep-then')).toBeNull();
  });

  it('Switch without a matching case renders nothing and does not warn', () => {
    const warn = vi.spyOn(console, 'warn');
    const { container } = renderInFlow(
      <Layout />,
      flowOf([{ type: 'Switch', value: '${data.k}', cases: { a: [body('A')] } }]),
      { data: { k: 'zzz' } },
    );
    expect(container.querySelector('.flow-layout')?.childElementCount).toBe(0);
    expect(warn).not.toHaveBeenCalled();
  });
});
