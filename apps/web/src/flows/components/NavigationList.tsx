import { interpolate as interpolateText } from '../expr';
import '../flows.css';
import { useFlow } from '../FlowContext';
import { actionOf, isRecord } from './display';
import { prop } from './field';
import { safeImageSrc } from './media';

type C = Record<string, unknown>;
const MAX_ITEMS = 20;

function Block({
  v,
  className,
  text,
}: {
  v: unknown;
  className: string;
  text: (v: unknown) => string;
}) {
  if (!isRecord(v)) return null;
  const title = text(v.title);
  const description = text(v.description);
  const metadata = text(v.metadata);
  if (!title && !description && !metadata) return null;
  return (
    <span className={className}>
      {title && <span className="flow-nav__title">{title}</span>}
      {description && <span className="flow-nav__desc">{description}</span>}
      {metadata && <span className="flow-nav__meta">{metadata}</span>}
    </span>
  );
}

export function NavigationList({ c }: { c: C }) {
  const { scope, runAction } = useFlow();
  const text = (v: unknown): string => (typeof v === 'string' ? interpolateText(v, scope) : '');
  const raw = prop(c, 'list-items');
  const items = (Array.isArray(raw) ? raw : []).filter(isRecord).slice(0, MAX_ITEMS);
  return (
    <ul className="flow-nav">
      {items.map((item, i) => {
        const action = actionOf(item['on-click-action']);
        const start = isRecord(item.start) ? safeImageSrc(item.start.image) : undefined;
        const startAlt = isRecord(item.start) ? text(item.start['alt-text']) : '';
        const tags = (Array.isArray(item.tags) ? item.tags : []).filter(
          (t): t is string => typeof t === 'string',
        );
        const badge = text(item.badge);
        return (
          // ids come from untrusted JSON and may repeat: combine with the index
          <li key={`${i}:${typeof item.id === 'string' ? item.id : ''}`}>
            <button
              type="button"
              className="flow-nav__item"
              disabled={!action}
              onClick={() => action && runAction(action)}
            >
              {start && <img className="flow-nav__img" src={start} alt={startAlt} />}
              <Block v={item['main-content']} className="flow-nav__main" text={text} />
              <Block v={item.end} className="flow-nav__end" text={text} />
              {badge && <span className="flow-nav__badge">{badge}</span>}
              {tags.length > 0 && (
                <span className="flow-nav__tags">
                  {tags.map((t, j) => (
                    <span key={`${j}:${t}`} className="flow-nav__tag">
                      {interpolateText(t, scope)}
                    </span>
                  ))}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
