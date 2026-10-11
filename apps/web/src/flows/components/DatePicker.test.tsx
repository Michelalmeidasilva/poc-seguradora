import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { useFlow } from '../FlowContext';
import { flowOf, renderInFlow } from '../test-utils';
import { CalendarPicker } from './CalendarPicker';
import { DatePicker } from './DatePicker';

function Probe() {
  const { state } = useFlow();
  return <output data-testid="form">{JSON.stringify(state.form)}</output>;
}
const form = () => JSON.parse(screen.getByTestId('form').textContent ?? '{}');

describe('DatePicker', () => {
  const c = {
    type: 'DatePicker',
    name: 'd',
    label: 'Data',
    'min-date': '2026-10-10',
    'max-date': '2026-12-31',
    'unavailable-dates': ['2026-11-01'],
    required: true,
  } as const;

  it('is a native date input carrying min/max and stores the value', async () => {
    const user = userEvent.setup();
    renderInFlow(
      <>
        <DatePicker c={c} />
        <Probe />
      </>,
      flowOf([c]),
    );
    const input = screen.getByLabelText('Data');
    expect(input).toHaveAttribute('type', 'date');
    expect(input).toHaveAttribute('min', '2026-10-10');
    expect(input).toHaveAttribute('max', '2026-12-31');
    await user.type(input, '2026-11-15');
    expect(form()).toEqual({ d: '2026-11-15' });
  });

  it('shows the min-date violation after blur', async () => {
    const user = userEvent.setup();
    renderInFlow(<DatePicker c={c} />, flowOf([c]));
    const input = screen.getByLabelText('Data');
    await user.type(input, '2026-01-01');
    expect(screen.queryByText(/a partir de/)).toBeNull();
    await user.tab();
    expect(screen.getByText('A data deve ser a partir de 10/10/2026')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('flags an unavailable date', async () => {
    const user = userEvent.setup();
    renderInFlow(<DatePicker c={c} />, flowOf([c]));
    await user.type(screen.getByLabelText('Data'), '2026-11-01');
    await user.tab();
    expect(screen.getByText('Data indisponível')).toBeInTheDocument();
  });

  it('seeds init-value and honours enabled false', () => {
    const d = { ...c, 'init-value': '2026-11-20', enabled: false };
    renderInFlow(<DatePicker c={d} />, flowOf([d]));
    const input = screen.getByLabelText('Data');
    expect(input).toHaveValue('2026-11-20');
    expect(input).toBeDisabled();
  });
});

describe('CalendarPicker', () => {
  it('single mode behaves like a date input', async () => {
    const user = userEvent.setup();
    const c = { type: 'CalendarPicker', name: 's', label: 'Dia', mode: 'single' } as const;
    renderInFlow(
      <>
        <CalendarPicker c={c} />
        <Probe />
      </>,
      flowOf([c]),
    );
    await user.type(screen.getByLabelText('Dia'), '2026-10-20');
    expect(form()).toEqual({ s: '2026-10-20' });
  });

  const range = {
    type: 'CalendarPicker',
    name: 'r',
    label: 'Período',
    mode: 'range',
    required: true,
  } as const;

  it('range stores {start-date, end-date}', async () => {
    const user = userEvent.setup();
    renderInFlow(
      <>
        <CalendarPicker c={range} />
        <Probe />
      </>,
      flowOf([range]),
    );
    expect(screen.getByRole('group', { name: 'Período' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Data inicial'), '2026-10-20');
    await user.type(screen.getByLabelText('Data final'), '2026-10-25');
    expect(form()).toEqual({ r: { 'start-date': '2026-10-20', 'end-date': '2026-10-25' } });
  });

  it('range end before start is an error, shown once focus leaves the group', async () => {
    const user = userEvent.setup();
    renderInFlow(<CalendarPicker c={range} />, flowOf([range]));
    await user.type(screen.getByLabelText('Data inicial'), '2026-10-20');
    await user.type(screen.getByLabelText('Data final'), '2026-10-10');
    expect(screen.queryByText(/data final deve/)).toBeNull();
    await user.tab();
    await user.tab();
    expect(
      screen.getByText('A data final deve ser igual ou posterior à inicial'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Data final')).toHaveAttribute('aria-invalid', 'true');
  });

  it('does not touch when moving between the two inputs', async () => {
    const user = userEvent.setup();
    renderInFlow(<CalendarPicker c={range} />, flowOf([range]));
    await user.type(screen.getByLabelText('Data inicial'), '2026-10-20');
    await user.tab();
    expect(screen.queryByText('Informe as duas datas')).toBeNull();
  });
});
