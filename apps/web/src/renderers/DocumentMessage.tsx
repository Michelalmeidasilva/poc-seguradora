import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { DocumentPayload } from '@seguradora/protocol';
import './renderers.css';

type DocumentItem = DocumentPayload['documents'][number];

export function DocumentMessage({ payload }: { payload: DocumentPayload }) {
  const [selected, setSelected] = useState<DocumentItem | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const keepFocusInDialog = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Tab') return;
    const focusable = event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  useEffect(() => {
    if (!selected) return;

    closeButtonRef.current?.focus();
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setSelected(null);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      triggerRef.current?.focus();
    };
  }, [selected]);

  return (
    <div className="document-message">
      <ul className="document-message__list">
        {payload.documents.map((item) => (
          <li className="document-message__item" key={item.id}>
            <div className="document-message__details">
              <strong className="document-message__title">{item.title}</strong>
              <span className="document-message__status">
                {item.status === 'available' ? 'Disponível' : 'Em geração'}
              </span>
            </div>
            {item.status === 'available' ? (
              <button
                className="document-message__open"
                onClick={(event) => {
                  triggerRef.current = event.currentTarget;
                  setSelected(item);
                }}
                type="button"
              >
                Abrir <span className="sr-only">{item.title}</span>
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      {selected ? (
        <div className="document-dialog__backdrop">
          <section
            aria-labelledby="document-dialog-title"
            aria-modal="true"
            className="document-dialog"
            onKeyDown={keepFocusInDialog}
            role="dialog"
          >
            <header className="document-dialog__header">
              <h2 id="document-dialog-title">{selected.title}</h2>
              <button
                aria-label="Fechar"
                className="document-dialog__close"
                onClick={() => setSelected(null)}
                ref={closeButtonRef}
                type="button"
              >
                Fechar
              </button>
            </header>
            <p className="document-dialog__notice">
              Este é um conteúdo demonstrativo. Nenhum documento real está disponível.
            </p>
          </section>
        </div>
      ) : null}
    </div>
  );
}
