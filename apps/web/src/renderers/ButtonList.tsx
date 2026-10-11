import { ExternalIcon, PhoneIcon } from '../ui/icons';
import './renderers.css';
import { safeHttpUrl, safeTelHref } from './safe-urls';

export type MessageButton =
  | { type: 'quick_reply'; id: string; title: string }
  | { type: 'url'; title: string; url: string }
  | { type: 'phone'; title: string; phone: string };

export interface ButtonListProps {
  buttons: MessageButton[];
  interactive: boolean;
  onChoice(optionId: string, title: string): void;
}

/** Quick replies are gated by `interactive`; safe URL/phone buttons are always active; unsafe ones are dropped. */
export function ButtonList({ buttons, interactive, onChoice }: ButtonListProps) {
  if (buttons.length === 0) return null;
  return (
    <div className="template__buttons">
      {buttons.map((b, index) => {
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
  );
}
