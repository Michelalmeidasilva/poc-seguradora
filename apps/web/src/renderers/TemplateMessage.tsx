import { ButtonList, type MessageButton } from './ButtonList';
import './renderers.css';
import { FormattedText } from './TextMessage';

export interface TemplatePayload {
  header?: string | undefined;
  body: string;
  footer?: string | undefined;
  buttons: MessageButton[];
}

export interface TemplateMessageProps {
  payload: TemplatePayload;
  interactive: boolean;
  onChoice(optionId: string, title: string): void;
}

export function TemplateMessage({ payload, interactive, onChoice }: TemplateMessageProps) {
  return (
    <div className="template">
      {payload.header ? <strong className="template__header">{payload.header}</strong> : null}
      <div className="template__body">
        <FormattedText text={payload.body} />
      </div>
      {payload.footer ? <div className="template__footer">{payload.footer}</div> : null}
      <ButtonList buttons={payload.buttons} interactive={interactive} onChoice={onChoice} />
    </div>
  );
}
