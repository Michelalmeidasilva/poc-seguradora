import './renderers.css';
import { FormattedText } from './TextMessage';

export interface QuickReplyOption {
  id: string;
  title: string;
}

export interface QuickRepliesProps {
  text: string;
  options: QuickReplyOption[];
  interactive: boolean;
  onChoice(optionId: string, title: string): void;
}

export function QuickReplies({ text, options, interactive, onChoice }: QuickRepliesProps) {
  return (
    <div className="quick">
      <div className="quick__text">
        <FormattedText text={text} />
      </div>
      <div className="quick__options">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            className="quick__button"
            disabled={!interactive}
            onClick={() => onChoice(o.id, o.title)}
          >
            {o.title}
          </button>
        ))}
      </div>
    </div>
  );
}
