import type { OpenFlowRequest } from './flow-host';

/** Provisional host (Plan 4): the Flow engine arrives in Plan 5. */
export function FlowPlaceholder({
  request,
  onClose,
}: {
  request: OpenFlowRequest;
  onClose(): void;
}) {
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
        <button type="button" onClick={onClose}>
          Fechar
        </button>
      </div>
    </div>
  );
}
