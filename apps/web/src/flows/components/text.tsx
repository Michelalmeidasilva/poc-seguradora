import '../flows.css';
import type { ReactNode } from 'react';
import { parseFormatting, type TextNode } from '../../renderers/format-text';
import { safeHttpUrl } from '../../renderers/safe-urls';
import { useFlow } from '../FlowContext';
import { interpolate } from '../expr';
import type { TextComponent } from '../schema';

/** Bold, italic, strike and links only; code markers and everything else stay plain text. */
function renderInline(nodes: TextNode[]): ReactNode[] {
  return nodes.map((node, i) => {
    switch (node.type) {
      case 'text':
        return node.value;
      case 'mono':
      case 'block':
        return node.value;
      case 'bold':
        return <strong key={i}>{renderInline(node.children)}</strong>;
      case 'italic':
        return <em key={i}>{renderInline(node.children)}</em>;
      case 'strike':
        return <del key={i}>{renderInline(node.children)}</del>;
      case 'link': {
        const href = safeHttpUrl(node.href);
        return href ? (
          <a key={i} href={href} target="_blank" rel="noopener noreferrer">
            {node.label}
          </a>
        ) : (
          node.label
        );
      }
    }
  });
}

const MD_LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)/gu;

/** Inline markup plus `[label](url)`; an unsafe url leaves just the label. */
function Inline({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(MD_LINK)) {
    if (m.index > last) out.push(...renderInline(parseFormatting(text.slice(last, m.index))));
    const href = safeHttpUrl(m[2] ?? '');
    out.push(
      href ? (
        <a key={m.index} href={href} target="_blank" rel="noopener noreferrer">
          {m[1]}
        </a>
      ) : (
        m[1]
      ),
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(...renderInline(parseFormatting(text.slice(last))));
  return <>{out}</>;
}

const useText = (c: TextComponent): string => {
  const { scope } = useFlow();
  const raw = Array.isArray(c.text) ? c.text.join('\n') : (c.text ?? '');
  return interpolate(raw, scope);
};

export function TextHeading({ c }: { c: TextComponent }) {
  return <h3 className="flow-heading">{useText(c)}</h3>;
}

export function TextSubheading({ c }: { c: TextComponent }) {
  return <h4 className="flow-subheading">{useText(c)}</h4>;
}

type Weight = 'bold' | 'italic' | 'bold_italic' | 'normal';

export function TextBody({
  c,
}: {
  c: TextComponent & { 'font-weight'?: Weight; strikethrough?: boolean };
}) {
  const text = useText(c);
  const weight = c['font-weight'];
  const classes = ['flow-body'];
  if (weight === 'bold' || weight === 'bold_italic') classes.push('flow-body--bold');
  if (weight === 'italic' || weight === 'bold_italic') classes.push('flow-body--italic');
  if (c.strikethrough === true) classes.push('flow-body--strike');
  return (
    <p className={classes.join(' ')}>
      <Inline text={text} />
    </p>
  );
}

export function TextCaption({ c }: { c: TextComponent }) {
  const text = useText(c);
  return (
    <p className="flow-caption">
      <Inline text={text} />
    </p>
  );
}

type Block =
  | { kind: 'heading'; level: 3 | 4 | 5; text: string }
  | { kind: 'ul' | 'ol'; items: string[] }
  | { kind: 'p'; text: string };

const HEADING = /^(#{1,3})\s+(.+)$/u;
const BULLET = /^[-*]\s+(.+)$/u;
const ORDERED = /^\d+[.)]\s+(.+)$/u;

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    const h = HEADING.exec(line);
    const b = BULLET.exec(line);
    const o = ORDERED.exec(line);
    const last = blocks[blocks.length - 1];
    if (h) {
      blocks.push({
        kind: 'heading',
        level: (2 + (h[1]?.length ?? 1)) as 3 | 4 | 5,
        text: h[2] ?? '',
      });
    } else if (b || o) {
      const kind = b ? 'ul' : 'ol';
      const item = (b ?? o)?.[1] ?? '';
      if (last && last.kind === kind) last.items.push(item);
      else blocks.push({ kind, items: [item] });
    } else {
      blocks.push({ kind: 'p', text: line });
    }
  }
  return blocks;
}

/** Markdown subset: `#` headings, bold, italic, strike, lists, links. Never HTML. */
export function RichText({ c }: { c: TextComponent }) {
  const text = useText(c);
  return (
    <div className="flow-rich">
      {parseBlocks(text).map((block, i) => {
        switch (block.kind) {
          case 'heading': {
            const Tag = `h${block.level}` as 'h3' | 'h4' | 'h5';
            return (
              <Tag key={i} className="flow-rich__heading">
                <Inline text={block.text} />
              </Tag>
            );
          }
          case 'ul':
          case 'ol': {
            const Tag = block.kind;
            return (
              <Tag key={i} className="flow-rich__list">
                {block.items.map((item, j) => (
                  <li key={j}>
                    <Inline text={item} />
                  </li>
                ))}
              </Tag>
            );
          }
          case 'p':
            return (
              <p key={i} className="flow-rich__p">
                <Inline text={block.text} />
              </p>
            );
        }
      })}
    </div>
  );
}
