import { useEffect, useId } from 'react';
import { useFlow } from '../FlowContext';
import { interpolate, resolveValue } from '../expr';
import { screenErrors } from '../runtime';
import type { Option } from '../schema';

// Flow JSON is untrusted: every prop is read defensively and by own key.
type Props = Record<string, unknown>;

export const prop = (c: Props, key: string): unknown =>
  Object.hasOwn(c, key) ? c[key] : undefined;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Seeds `form[name]` once, and only when the name is still unset (Back keeps user edits). */
export function useInitValue(name: string, initValue: unknown): void {
  const { state, dispatch, scope } = useFlow();
  const unset = !Object.hasOwn(state.form, name);
  const seed = initValue === undefined ? undefined : resolveValue(initValue, scope);
  useEffect(() => {
    // Re-running (StrictMode) is harmless: `unset` flips once the set lands.
    if (name !== '' && unset && seed !== undefined)
      dispatch({ type: 'set', name, value: seed, source: 'init' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed only when the field is unset
  }, [name, unset]);
}

export interface Field {
  name: string;
  value: unknown;
  label: string;
  helper: string;
  error: string | undefined;
  disabled: boolean;
  required: boolean;
  controlId: string;
  describedBy: string | undefined;
  helperId: string;
  errorId: string;
  set: (value: unknown) => void;
  touch: () => void;
  text: (v: unknown) => string;
}

export function useField(c: Props): Field {
  const { flow, state, scope, dispatch } = useFlow();
  const id = useId();
  const rawName = prop(c, 'name');
  const name = typeof rawName === 'string' ? rawName : '';
  useInitValue(name, prop(c, 'init-value'));
  const text = (v: unknown): string => (typeof v === 'string' ? interpolate(v, scope) : '');
  const errors = screenErrors(flow, state);
  const error =
    Object.hasOwn(state.touched, name) && Object.hasOwn(errors, name) ? errors[name] : undefined;
  const helper = text(prop(c, 'helper-text'));
  const helperId = `${id}-help`;
  const errorId = `${id}-err`;
  const describedBy = [helper ? helperId : '', error ? errorId : ''].filter(Boolean).join(' ');
  return {
    name,
    value: Object.hasOwn(state.form, name) ? state.form[name] : undefined,
    label: text(prop(c, 'label')),
    helper,
    error,
    disabled: resolveValue(prop(c, 'enabled'), scope) === false,
    required: prop(c, 'required') === true,
    controlId: `${id}-ctl`,
    describedBy: describedBy || undefined,
    helperId,
    errorId,
    set: (value) => dispatch({ type: 'set', name, value }),
    touch: () => dispatch({ type: 'touch', name }),
    text,
  };
}

/** Helper and error lines, wired to the control through `describedBy`. */
export function FieldMessages({ f }: { f: Field }) {
  return (
    <>
      {f.helper && (
        <p id={f.helperId} className="flow-field__helper">
          {f.helper}
        </p>
      )}
      {f.error && (
        <p id={f.errorId} className="flow-field__error">
          {f.error}
        </p>
      )}
    </>
  );
}

/** Label plus control plus messages for single-control fields. */
export function FieldShell({ f, children }: { f: Field; children: React.ReactNode }) {
  return (
    <div className="flow-field" data-flow-field={f.name}>
      <label htmlFor={f.controlId} className="flow-field__label">
        {f.label}
      </label>
      {children}
      <FieldMessages f={f} />
    </div>
  );
}

/** Touch only when focus leaves the whole group, not between its controls. */
export const groupBlur = (touch: () => void) => (e: React.FocusEvent<HTMLElement>) => {
  if (!(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget)) touch();
};

export function optionsOf(source: unknown, text: (v: unknown) => string): Option[] {
  if (!Array.isArray(source)) return [];
  const out: Option[] = [];
  for (const o of source) {
    if (!isRecord(o) || typeof o.id !== 'string') continue;
    out.push({
      id: o.id,
      title: text(o.title),
      ...(typeof o.description === 'string' ? { description: text(o.description) } : {}),
      ...(o.enabled === false ? { enabled: false } : {}),
    });
  }
  return out;
}
