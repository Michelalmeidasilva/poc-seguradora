export type TextNode =
  | { type: 'text'; value: string }
  | { type: 'bold' | 'italic' | 'strike'; children: TextNode[] }
  | { type: 'mono' | 'block'; value: string }
  | { type: 'link'; href: string; label: string };

type Rule = { kind: 'block' | 'mono' | 'bold' | 'italic' | 'strike'; re: RegExp };

// WhatsApp-style markers: they must hug the marked text and not touch letters or digits.
const RULES: Rule[] = [
  { kind: 'block', re: /```([\s\S]+?)```/u },
  { kind: 'mono', re: /(?<![\p{L}\p{N}`])`(?=\S)([^`\n]+?)(?<=\S)`(?![\p{L}\p{N}`])/u },
  { kind: 'bold', re: /(?<![\p{L}\p{N}*])\*(?=\S)([^*\n]+?)(?<=\S)\*(?![\p{L}\p{N}*])/u },
  { kind: 'italic', re: /(?<![\p{L}\p{N}_])_(?=\S)([^_\n]+?)(?<=\S)_(?![\p{L}\p{N}_])/u },
  { kind: 'strike', re: /(?<![\p{L}\p{N}~])~(?=\S)([^~\n]+?)(?<=\S)~(?![\p{L}\p{N}~])/u },
];

const URL_RE = /https?:\/\/[^\s<>"']+/u;
const TRAILING_PUNCTUATION = /[.,;:!?)\]]+$/u;

interface Found {
  index: number;
  length: number;
  node: TextNode;
}

export function parseFormatting(text: string): TextNode[] {
  const nodes: TextNode[] = [];
  let rest = text;

  while (rest.length > 0) {
    let best: Found | undefined;

    for (const rule of RULES) {
      const m = rule.re.exec(rest);
      if (!m || (best !== undefined && m.index >= best.index)) continue;
      const inner = m[1] ?? '';
      const node: TextNode =
        rule.kind === 'block' || rule.kind === 'mono'
          ? { type: rule.kind, value: inner }
          : { type: rule.kind, children: parseFormatting(inner) };
      best = { index: m.index, length: m[0].length, node };
    }

    const link = URL_RE.exec(rest);
    if (link && (best === undefined || link.index < best.index)) {
      const href = link[0].replace(TRAILING_PUNCTUATION, '');
      best = { index: link.index, length: href.length, node: { type: 'link', href, label: href } };
    }

    if (!best) {
      nodes.push({ type: 'text', value: rest });
      break;
    }
    if (best.index > 0) nodes.push({ type: 'text', value: rest.slice(0, best.index) });
    nodes.push(best.node);
    rest = rest.slice(best.index + best.length);
  }

  return nodes;
}
