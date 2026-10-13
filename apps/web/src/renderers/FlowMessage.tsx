import './renderers.css';
import type { OpenFlowRequest } from './flow-host';
import { FormattedText } from './TextMessage';

export interface FlowPayload {
  flowId: string;
  header?: string | undefined;
  body: string;
  footer?: string | undefined;
  ctaLabel: string;
  flowJson: Record<string, unknown>;
  initialData?: { intent: 'review' | 'correction'; values: Record<string, string | boolean> } | undefined;
}

export function FlowMessage({
  payload,
  onOpen,
}: {
  payload: FlowPayload;
  onOpen(request: OpenFlowRequest): void;
}) {
  return (
    <div className="flow-message">
      {payload.header ? <strong>{payload.header}</strong> : null}
      <div>
        <FormattedText text={payload.body} />
      </div>
      {payload.footer ? <div className="template__footer">{payload.footer}</div> : null}
      <button
        type="button"
        className="template__button"
        onClick={() =>
          onOpen({
            flowId: payload.flowId,
            ctaLabel: payload.ctaLabel,
            flowJson: payload.flowJson,
            header: payload.header,
            body: payload.body,
            initialData: payload.initialData,
          })
        }
      >
        {payload.ctaLabel}
      </button>
    </div>
  );
}
