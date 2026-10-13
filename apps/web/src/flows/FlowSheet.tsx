import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { err, type Result } from '@seguradora/protocol';
import './flows.css';
import type { FlowHost } from './actions';
import { Layout } from './components/Layout';
import { interpolate } from './expr';
import { FlowProvider } from './FlowContext';
import { unknownFormRefs } from './runtime';
import { type FlowIssue, type FlowJson, parseFlow } from './schema';
import { useFlowSheet } from './useFlow';

/** What the sheet needs to open a Flow (structurally a subset of the chat's OpenFlowRequest). */
export interface FlowSheetRequest {
  flowId: string;
  flowJson: Record<string, unknown>;
  header?: string | undefined;
  initialData?: { intent: 'review' | 'correction'; values: Record<string, string | boolean> } | undefined;
}

export interface FlowSheetProps {
  request: FlowSheetRequest;
  onClose(): void;
  submit: FlowHost['submit'];
  exchange: FlowHost['exchange'];
}

const FALLBACK_TITLE = 'Formulário';

/**
 * parseFlow plus the open-time check that every `${form.x}` names a field some screen declares.
 * Cross-screen refs are allowed (shared form; a deviation from Meta, which allows same-screen only).
 */
function openFlow(json: Record<string, unknown>): Result<FlowJson, FlowIssue[]> {
  const parsed = parseFlow(json);
  if (!parsed.ok) return parsed;
  const unknown = unknownFormRefs(parsed.value);
  if (unknown.length === 0) return parsed;
  return err(
    unknown.map((name) => ({
      path: `form.${name}`,
      code: 'unknown_form_ref',
      message: 'Campo referenciado não existe.',
    })),
  );
}

/** Full-screen bottom sheet hosting one Flow. Remount it (key) to start the Flow over. */
export function FlowSheet({ request, onClose, submit, exchange }: FlowSheetProps) {
  const parsed = useMemo(() => openFlow(request.flowJson), [request.flowJson]);

  useEffect(() => {
    if (parsed.ok) return;
    // Paths and codes only: messages and values may echo Flow content.
    console.warn(
      '[flows] invalid Flow JSON',
      parsed.error.map((i) => `${i.path || '<root>'}: ${i.code}`),
    );
  }, [parsed]);

  if (!parsed.ok) {
    return (
      <SheetFrame title={request.header ?? FALLBACK_TITLE} screenKey="error" onClose={onClose}>
        <div className="flow-sheet__error">
          <p>Não foi possível abrir este formulário.</p>
          <button type="button" className="flow-footer__button" onClick={onClose}>
            Fechar
          </button>
        </div>
      </SheetFrame>
    );
  }
  return (
    <FlowSession
      key={request.flowId}
      flow={parsed.value}
      request={request}
      onClose={onClose}
      submit={submit}
      exchange={exchange}
    />
  );
}

function FlowSession({
  flow,
  request,
  onClose,
  submit,
  exchange,
}: FlowSheetProps & { flow: FlowJson }) {
  // Callback ref + state: the portal target exists before Layout (and its Footer) first renders.
  const [footerSlot, setFooterSlot] = useState<HTMLDivElement | null>(null);
  const session = useFlowSheet(flow, request.flowId, { submit, exchange, onClose }, footerSlot, request.initialData?.values);
  const { screen, context } = session;
  const title =
    (typeof screen.title === 'string' ? interpolate(screen.title, context.scope) : '') ||
    request.header ||
    FALLBACK_TITLE;

  return (
    <SheetFrame
      title={title}
      screenKey={`${context.state.stack.length}:${screen.id}`}
      onClose={onClose}
      onBack={session.canGoBack ? session.back : undefined}
      isDirty={session.isDirty}
      showClose
      footerRef={setFooterSlot}
    >
      {footerSlot ? (
        <FlowProvider value={context}>
          <Layout />
        </FlowProvider>
      ) : null}
    </SheetFrame>
  );
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]';

/** Tab stops in DOM order; a radio group counts once (its checked radio, else its first). */
function tabStops(root: HTMLElement): HTMLElement[] {
  const all = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.tabIndex >= 0 && !el.closest('[inert],[hidden]'),
  );
  const groups = new Map<string, HTMLInputElement[]>();
  for (const el of all) {
    if (el instanceof HTMLInputElement && el.type === 'radio' && el.name) {
      groups.set(el.name, [...(groups.get(el.name) ?? []), el]);
    }
  }
  return all.filter((el) => {
    if (!(el instanceof HTMLInputElement) || el.type !== 'radio' || !el.name) return true;
    const group = groups.get(el.name) ?? [];
    return el === (group.find((r) => r.checked) ?? group[0]);
  });
}

const follows = (a: Node, b: Node): boolean =>
  (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

const prefersReducedMotion = (): boolean =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface SheetFrameProps {
  title: string;
  /** Changes on every screen change; the heading takes the focus each time. */
  screenKey: string;
  onClose(): void;
  onBack?: (() => void) | undefined;
  /** When it returns true, Close/Escape ask before discarding. */
  isDirty?: () => boolean;
  showClose?: boolean;
  footerRef?: (el: HTMLDivElement | null) => void;
  children: ReactNode;
}

function SheetFrame({
  title,
  screenKey,
  onClose,
  onBack,
  isDirty,
  showClose = false,
  footerRef,
  children,
}: SheetFrameProps) {
  const titleId = useId();
  const confirmTitleId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  const focusBeforeConfirm = useRef<Element | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [reducedMotion] = useState(prefersReducedMotion);

  const latest = useRef({ onClose, isDirty, confirming });
  latest.current = { onClose, isDirty, confirming };

  const requestClose = useCallback(() => {
    if (latest.current.isDirty?.()) {
      focusBeforeConfirm.current = document.activeElement;
      setConfirming(true);
    } else {
      latest.current.onClose();
    }
  }, []);

  // Runs before the heading effect, so it captures the opener, not the heading.
  useLayoutEffect(() => {
    const opener = document.activeElement;
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  useEffect(() => {
    headingRef.current?.focus();
  }, [screenKey]);

  const wasConfirming = useRef(false);
  useEffect(() => {
    if (confirming) keepEditingRef.current?.focus();
    else if (wasConfirming.current) {
      const back = focusBeforeConfirm.current;
      if (back instanceof HTMLElement && back.isConnected) back.focus();
      else headingRef.current?.focus();
    }
    wasConfirming.current = confirming;
  }, [confirming]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        if (latest.current.confirming) setConfirming(false);
        else requestClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const stops = tabStops(root);
      const first = stops[0];
      const last = stops[stops.length - 1];
      if (!first || !last) {
        e.preventDefault();
        return;
      }
      const active = document.activeElement;
      const inside = active instanceof HTMLElement && root.contains(active);
      const usable = inside && !active.closest('[inert]');
      if (!usable) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }
      // Only the edges are handled; inside, the browser's own order applies.
      const hasNext = stops.some((el) => el !== active && follows(active, el));
      const hasPrev = stops.some((el) => el !== active && follows(el, active));
      if (e.shiftKey && !hasPrev) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && !hasNext) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [requestClose]);

  return (
    <div
      ref={rootRef}
      className={`flow-sheet${reducedMotion ? ' flow-sheet--reduced-motion' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="flow-sheet__panel" inert={confirming}>
        <header className="flow-sheet__header">
          {onBack ? (
            <button type="button" className="flow-sheet__icon" aria-label="Voltar" onClick={onBack}>
              ←
            </button>
          ) : (
            <span className="flow-sheet__icon-spacer" />
          )}
          <h2 id={titleId} ref={headingRef} className="flow-sheet__title" tabIndex={-1}>
            {title}
          </h2>
          {showClose ? (
            <button
              type="button"
              className="flow-sheet__icon"
              aria-label="Fechar"
              onClick={requestClose}
            >
              ×
            </button>
          ) : (
            <span className="flow-sheet__icon-spacer" />
          )}
        </header>
        <div className="flow-sheet__body">{children}</div>
        {footerRef ? <div ref={footerRef} className="flow-sheet__footer" /> : null}
      </div>
      {confirming ? (
        <div className="flow-sheet__confirm-backdrop">
          <div
            className="flow-sheet__confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={confirmTitleId}
          >
            <p id={confirmTitleId} className="flow-sheet__confirm-title">
              Descartar o formulário?
            </p>
            <div className="flow-sheet__confirm-actions">
              <button type="button" ref={keepEditingRef} onClick={() => setConfirming(false)}>
                Continuar editando
              </button>
              <button type="button" onClick={onClose}>
                Descartar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
