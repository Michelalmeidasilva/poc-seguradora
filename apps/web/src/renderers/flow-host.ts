/** What a Flow host (Plan 5) needs to open a Flow from a `message.flow`. */
export interface OpenFlowRequest {
  flowId: string;
  ctaLabel: string;
  flowJson: Record<string, unknown>;
  header?: string | undefined;
  body: string;
}

export type OpenFlow = (request: OpenFlowRequest) => void;
