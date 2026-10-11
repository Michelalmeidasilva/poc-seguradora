import { createPortal } from 'react-dom';
import '../flows.css';
import { useFlow } from '../FlowContext';
import { interpolate } from '../expr';
import { footerDisabled, screenErrors } from '../runtime';
import { actionOf } from './display';
import { prop } from './field';

type C = Record<string, unknown>;

const FOCUSABLE = 'input,select,textarea,button,[tabindex]';

/** Focuses the first control (DOM order) of a field named in `errors`. */
function focusFirstInvalid(errors: Record<string, string>): void {
  for (const el of document.querySelectorAll<HTMLElement>('[data-flow-field]')) {
    const name = el.getAttribute('data-flow-field') ?? '';
    if (!Object.hasOwn(errors, name)) continue;
    const target = el.matches(FOCUSABLE) ? el : el.querySelector<HTMLElement>(FOCUSABLE);
    if (target) {
      target.focus();
      return;
    }
  }
}

export function Footer({ c }: { c: C }) {
  const { flow, state, scope, dispatch, runAction, footerSlot } = useFlow();
  const text = (v: unknown): string => (typeof v === 'string' ? interpolate(v, scope) : '');
  const action = actionOf(prop(c, 'on-click-action'));
  const errors = screenErrors(flow, state);
  const errorNames = Object.keys(errors);
  const disabled = footerDisabled(flow, state);
  // Center excludes left/right.
  const center = text(prop(c, 'center-caption'));
  const left = center ? '' : text(prop(c, 'left-caption'));
  const right = center ? '' : text(prop(c, 'right-caption'));

  const press = () => {
    if (state.outcome || state.pending === 'exchange') return;
    if (errorNames.length > 0) {
      for (const name of errorNames) dispatch({ type: 'touch', name });
      focusFirstInvalid(errors);
      return;
    }
    if (disabled || !action) return;
    runAction(action);
  };

  const node = (
    <div className="flow-footer">
      {center && <p className="flow-footer__caption flow-footer__caption--center">{center}</p>}
      {(left || right) && (
        <p className="flow-footer__caption flow-footer__caption--split">
          <span>{left}</span>
          <span>{right}</span>
        </p>
      )}
      {/* aria-disabled, not disabled: pressing with errors must still reveal them */}
      <button
        type="button"
        className="flow-footer__button"
        aria-disabled={disabled}
        onClick={press}
      >
        {text(prop(c, 'label'))}
      </button>
    </div>
  );
  return footerSlot ? createPortal(node, footerSlot) : node;
}
