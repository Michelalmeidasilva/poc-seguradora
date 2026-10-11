import type { ReactNode } from 'react';
import { parseFormatting, type TextNode } from './format-text';

function renderNode(node: TextNode, key: number): ReactNode {
  switch (node.type) {
    case 'text':
      return node.value;
    case 'bold':
      return <strong key={key}>{node.children.map(renderNode)}</strong>;
    case 'italic':
      return <em key={key}>{node.children.map(renderNode)}</em>;
    case 'strike':
      return <del key={key}>{node.children.map(renderNode)}</del>;
    case 'mono':
      return (
        <code key={key} className="mono">
          {node.value}
        </code>
      );
    case 'block':
      return (
        <pre key={key} className="mono mono--block">
          {node.value}
        </pre>
      );
    case 'link':
      return (
        <a key={key} href={node.href} target="_blank" rel="noopener noreferrer">
          {node.label}
        </a>
      );
  }
}

/** Renders server-provided text with WhatsApp formatting. Everything is text; never HTML. */
export function FormattedText({ text }: { text: string }) {
  return <>{parseFormatting(text).map(renderNode)}</>;
}
