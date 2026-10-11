import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flowOf, renderInFlow } from '../test-utils';
import { Layout } from './Layout';
import { resetUnknownWarnings } from './registry';

afterEach(() => {
  vi.restoreAllMocks();
  resetUnknownWarnings();
});

describe('Layout', () => {
  it('renders visible children and skips unknown types', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderInFlow(
      <Layout />,
      flowOf([
        { type: 'TextBody', text: 'Hello ${data.n}' },
        { type: 'Nope' },
        { type: 'TextBody', text: 'Hidden', visible: false },
      ]),
      { data: { n: 'Ana' } },
    );
    expect(screen.getByText('Hello Ana')).toBeInTheDocument();
    expect(screen.queryByText('Hidden')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('toggles with visible: "${data.show}"', () => {
    const flow = flowOf([{ type: 'TextBody', text: 'Shown', visible: '${data.show}' }]);
    const on = renderInFlow(<Layout />, flow, { data: { show: true } });
    expect(screen.getByText('Shown')).toBeInTheDocument();
    on.unmount();
    renderInFlow(<Layout />, flow, { data: { show: false } });
    expect(screen.queryByText('Shown')).toBeNull();
  });

  it('flattens If branches by form value', () => {
    const flow = flowOf([
      {
        type: 'If',
        condition: '${data.ok}',
        then: [{ type: 'TextBody', text: 'yes' }],
        else: [{ type: 'TextBody', text: 'no' }],
      },
    ]);
    renderInFlow(<Layout />, flow, { data: { ok: false } });
    expect(screen.getByText('no')).toBeInTheDocument();
  });
});
