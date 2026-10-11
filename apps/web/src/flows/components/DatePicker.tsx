import '../flows.css';
import { dateBound } from '../validation';
import { FieldShell, prop, useField } from './field';

type C = Record<string, unknown>;

/** Native `<input type="date">`; shared with CalendarPicker's single mode. */
export function DatePicker({ c }: { c: C }) {
  const f = useField(c);
  const min = dateBound(prop(c, 'min-date'));
  const max = dateBound(prop(c, 'max-date'));
  return (
    <FieldShell f={f}>
      <input
        id={f.controlId}
        className="flow-field__control"
        type="date"
        min={min}
        max={max}
        value={typeof f.value === 'string' ? f.value : ''}
        disabled={f.disabled}
        onChange={(e) => f.set(e.target.value)}
        onBlur={f.touch}
        aria-invalid={f.error !== undefined}
        aria-describedby={f.describedBy}
        aria-required={f.required || undefined}
      />
    </FieldShell>
  );
}
