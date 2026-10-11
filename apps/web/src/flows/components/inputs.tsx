import '../flows.css';
import { useFlow } from '../FlowContext';
import { FieldMessages, FieldShell, groupBlur, optionsOf, prop, useField } from './field';
import type { Field } from './field';

type C = Record<string, unknown>;

const HTML_TYPES: Record<string, { type: string; inputMode?: 'decimal' | 'numeric' }> = {
  text: { type: 'text' },
  email: { type: 'email' },
  password: { type: 'password' },
  passcode: { type: 'password', inputMode: 'numeric' },
  phone: { type: 'tel' },
  number: { type: 'text', inputMode: 'decimal' },
};

const aria = (f: Field) => ({
  'aria-invalid': f.error !== undefined,
  'aria-describedby': f.describedBy,
  'aria-required': f.required || undefined,
});

export function TextInput({ c }: { c: C }) {
  const f = useField(c);
  const kind = prop(c, 'input-type');
  const html =
    typeof kind === 'string' && Object.hasOwn(HTML_TYPES, kind) ? HTML_TYPES[kind] : undefined;
  return (
    <FieldShell f={f}>
      <input
        id={f.controlId}
        className="flow-field__control"
        type={html?.type ?? 'text'}
        inputMode={html?.inputMode}
        value={typeof f.value === 'string' || typeof f.value === 'number' ? String(f.value) : ''}
        disabled={f.disabled}
        onChange={(e) => f.set(e.target.value)}
        onBlur={f.touch}
        {...aria(f)}
      />
    </FieldShell>
  );
}

export function TextArea({ c }: { c: C }) {
  const f = useField(c);
  return (
    <FieldShell f={f}>
      <textarea
        id={f.controlId}
        className="flow-field__control flow-field__control--area"
        rows={4}
        value={typeof f.value === 'string' ? f.value : ''}
        disabled={f.disabled}
        onChange={(e) => f.set(e.target.value)}
        onBlur={f.touch}
        {...aria(f)}
      />
    </FieldShell>
  );
}

export function Dropdown({ c }: { c: C }) {
  const f = useField(c);
  const options = optionsOf(prop(c, 'data-source'), f.text);
  return (
    <FieldShell f={f}>
      <select
        id={f.controlId}
        className="flow-field__control"
        value={typeof f.value === 'string' ? f.value : ''}
        disabled={f.disabled}
        onChange={(e) => f.set(e.target.value)}
        onBlur={f.touch}
        {...aria(f)}
      >
        <option value="">Selecione</option>
        {options.map((o) => (
          <option key={o.id} value={o.id} disabled={o.enabled === false}>
            {o.title}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

function OptionText({ title, description }: { title: string; description?: string }) {
  return (
    <span className="flow-choice__text">
      <span>{title}</span>
      {description && <span className="flow-choice__desc">{description}</span>}
    </span>
  );
}

const limit = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : undefined;

export function CheckboxGroup({ c }: { c: C }) {
  const f = useField(c);
  const options = optionsOf(prop(c, 'data-source'), f.text);
  const max = limit(prop(c, 'max-selected-items'));
  const selected = Array.isArray(f.value) ? f.value.filter((v) => typeof v === 'string') : [];
  const full = max !== undefined && selected.length >= max;
  const toggle = (id: string) =>
    f.set(
      selected.includes(id)
        ? selected.filter((v) => v !== id)
        : options.map((o) => o.id).filter((v) => v === id || selected.includes(v)),
    );
  return (
    <fieldset
      className="flow-field flow-field--group"
      aria-describedby={f.describedBy}
      onBlur={groupBlur(f.touch)}
    >
      <legend className="flow-field__label">{f.label}</legend>
      {options.map((o) => {
        const checked = selected.includes(o.id);
        return (
          <label key={o.id} className="flow-choice">
            <input
              type="checkbox"
              checked={checked}
              disabled={f.disabled || o.enabled === false || (full && !checked)}
              onChange={() => toggle(o.id)}
              {...aria(f)}
            />
            <OptionText title={o.title} description={o.description} />
          </label>
        );
      })}
      <FieldMessages f={f} />
    </fieldset>
  );
}

export function RadioButtonsGroup({ c }: { c: C }) {
  const f = useField(c);
  const options = optionsOf(prop(c, 'data-source'), f.text);
  return (
    <fieldset
      className="flow-field flow-field--group"
      aria-describedby={f.describedBy}
      onBlur={groupBlur(f.touch)}
    >
      <legend className="flow-field__label">{f.label}</legend>
      {options.map((o) => (
        <label key={o.id} className="flow-choice">
          <input
            type="radio"
            name={f.controlId}
            checked={f.value === o.id}
            disabled={f.disabled || o.enabled === false}
            onChange={() => f.set(o.id)}
            {...aria(f)}
          />
          <OptionText title={o.title} description={o.description} />
        </label>
      ))}
      <FieldMessages f={f} />
    </fieldset>
  );
}

export function OptIn({ c }: { c: C }) {
  const f = useField(c);
  const { runAction } = useFlow();
  const action = prop(c, 'on-click-action');
  const isUrl = typeof action === 'object' && action !== null && (action as C).name === 'open_url';
  return (
    <div className="flow-field">
      <div className="flow-choice">
        <input
          id={f.controlId}
          type="checkbox"
          checked={f.value === true}
          disabled={f.disabled}
          onChange={(e) => f.set(e.target.checked)}
          onBlur={f.touch}
          {...aria(f)}
        />
        <label htmlFor={f.controlId}>{f.label}</label>
        {isUrl && (
          <button
            type="button"
            className="flow-link"
            onClick={() => runAction(action as Parameters<typeof runAction>[0])}
          >
            Ler os termos
          </button>
        )}
      </div>
      <FieldMessages f={f} />
    </div>
  );
}
