import '../flows.css';
import { useId } from 'react';
import { dateBound } from '../validation';
import { DatePicker } from './DatePicker';
import { FieldMessages, groupBlur, prop, useField } from './field';

type C = Record<string, unknown>;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const part = (v: unknown, key: string): string =>
  isRecord(v) && Object.hasOwn(v, key) && typeof v[key] === 'string' ? v[key] : '';

function RangeCalendar({ c }: { c: C }) {
  const f = useField(c);
  const id = useId();
  const min = dateBound(prop(c, 'min-date'));
  const max = dateBound(prop(c, 'max-date'));
  const start = part(f.value, 'start-date');
  const end = part(f.value, 'end-date');
  const common = {
    type: 'date' as const,
    className: 'flow-field__control',
    min,
    max,
    disabled: f.disabled,
    'aria-invalid': f.error !== undefined,
    'aria-describedby': f.describedBy,
  };
  return (
    <fieldset
      className="flow-field flow-field--group"
      aria-describedby={f.describedBy}
      onBlur={groupBlur(f.touch)}
    >
      <legend className="flow-field__label">{f.label}</legend>
      <label htmlFor={`${id}-s`} className="flow-field__sub">
        Data inicial
      </label>
      <input
        {...common}
        id={`${id}-s`}
        value={start}
        onChange={(e) => f.set({ 'start-date': e.target.value, 'end-date': end })}
      />
      <label htmlFor={`${id}-e`} className="flow-field__sub">
        Data final
      </label>
      <input
        {...common}
        id={`${id}-e`}
        value={end}
        onChange={(e) => f.set({ 'start-date': start, 'end-date': e.target.value })}
      />
      <FieldMessages f={f} />
    </fieldset>
  );
}

export function CalendarPicker({ c }: { c: C }) {
  return prop(c, 'mode') === 'range' ? <RangeCalendar c={c} /> : <DatePicker c={c} />;
}
