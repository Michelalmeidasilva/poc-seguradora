import { ExternalIcon, PhoneIcon } from '../ui/icons';
import './renderers.css';
import { safeHttpUrl, safeTelHref } from './safe-urls';
import { FormattedText } from './TextMessage';

type Button =
  | { type: 'quick_reply'; id: string; title: string }
  | { type: 'url'; title: string; url: string }
  | { type: 'phone'; title: string; phone: string };

export interface TemplatePayload {
  header?: string | undefined;
  body: string;
  footer?: string | undefined;
  buttons: Button[];
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
      {payload.buttons.length > 0 ? (
        <div className="template__buttons">
          {payload.buttons.map((b, index) => {
            const key = `${b.type}-${index}`;
            if (b.type === 'quick_reply') {
              return (
                <button
                  key={key}
                  type="button"
                  className="template__button"
                  disabled={!interactive}
                  onClick={() => onChoice(b.id, b.title)}
                >
                  {b.title}
                </button>
              );
            }
            if (b.type === 'url') {
              const href = safeHttpUrl(b.url);
              if (!href) return null;
              return (
                <a
                  key={key}
                  className="template__button"
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalIcon /> {b.title}
                </a>
              );
            }
            const tel = safeTelHref(b.phone);
            if (!tel) return null;
            return (
              <a key={key} className="template__button" href={tel}>
                <PhoneIcon /> {b.title}
              </a>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
