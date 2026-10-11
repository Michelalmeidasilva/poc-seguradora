import '../flows.css';
import { useFlow } from '../FlowContext';
import { actionOf } from './display';
import { FieldMessages, groupBlur, optionsOf, prop, useField } from './field';

type C = Record<string, unknown>;
const MAX_OPTIONS = 20;

const limit = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : undefined;

export function ChipsSelector({ c }: { c: C }) {
  const f = useField(c);
  const { runAction } = useFlow();
  const options = optionsOf(prop(c, 'data-source'), f.text).slice(0, MAX_OPTIONS);
  const max = limit(prop(c, 'max-selected-items'));
  const onSelect = actionOf(prop(c, 'on-select-action'));
  const onUnselect = actionOf(prop(c, 'on-unselect-action'));
  const selected = Array.isArray(f.value) ? f.value.filter((v) => typeof v === 'string') : [];
  const full = max !== undefined && selected.length >= max;
  const labelId = `${f.controlId}-label`;

  const toggle = (id: string) => {
    const on = selected.includes(id);
    if (!on && full) return;
    // keep data-source order, like CheckboxGroup
    f.set(options.map((o) => o.id).filter((v) => (v === id ? !on : selected.includes(v))));
    const action = on ? onUnselect : onSelect;
    if (action) runAction(action, { name: f.name, event: on ? 'unselect' : 'select' });
  };

  return (
    <div className="flow-field" data-flow-field={f.name}>
      <span id={labelId} className="flow-field__label">
        {f.label}
      </span>
      <div
        className="flow-chips"
        role="group"
        aria-labelledby={labelId}
        aria-describedby={f.describedBy}
        onBlur={groupBlur(f.touch)}
      >
        {options.map((o, i) => {
          const on = selected.includes(o.id);
          return (
            <button
              // option ids come from untrusted JSON and may repeat
              key={`${i}:${o.id}`}
              type="button"
              className="flow-chip"
              aria-pressed={on}
              disabled={f.disabled || o.enabled === false || (full && !on)}
              onClick={() => toggle(o.id)}
            >
              {o.title}
            </button>
          );
        })}
      </div>
      <FieldMessages f={f} />
    </div>
  );
}
