/** What the Flow host (flows/FlowSheet) needs to open a Flow from a `message.flow`. */
export interface OpenFlowRequest {
  flowId: string;
  ctaLabel: string;
  flowJson: Record<string, unknown>;
  header?: string | undefined;
  body: string;
  initialData?: { intent: 'review' | 'correction'; values: Record<string, string | boolean> } | undefined;
}

export type OpenFlow = (request: OpenFlowRequest) => void;
