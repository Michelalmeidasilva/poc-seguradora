import { useEffect, useRef } from 'react';
import type { OpenFlowRequest } from './flow-host';

/** Provisional host (Plan 4): the Flow engine arrives in Plan 5. */
export function FlowPlaceholder({
  request,
  onClose,
}: {
  request: OpenFlowRequest;
  onClose(): void;
}) {
  const close = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement;
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);

  return (
    <div
      className="flow-sheet"
      role="dialog"
      aria-modal="true"
      aria-label={request.header ?? 'Formulário'}
    >
      <div className="flow-sheet__panel">
        <h2>{request.header ?? 'Formulário'}</h2>
        <p>Formulário disponível em breve.</p>
        <button type="button" ref={close} onClick={onClose}>
          Fechar
        </button>
      </div>
    </div>
  );
}
