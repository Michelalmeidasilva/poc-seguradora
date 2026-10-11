import { describe, expect, it } from 'vitest';
import { parseFormatting, type TextNode } from './format-text';

const t = (value: string): TextNode => ({ type: 'text', value });

describe('parseFormatting', () => {
  it('returns plain text unchanged', () => {
    expect(parseFormatting('Olá, tudo bem?')).toEqual([t('Olá, tudo bem?')]);
  });

  it('returns nothing for an empty string', () => {
    expect(parseFormatting('')).toEqual([]);
  });

  it.each([
    ['*negrito*', 'bold'],
    ['_itálico_', 'italic'],
    ['~tachado~', 'strike'],
  ] as const)('parses %s', (input, type) => {
    const [node] = parseFormatting(input);
    expect(node?.type).toBe(type);
  });

  it('parses inline code and code blocks literally', () => {
    expect(parseFormatting('use `*não negrito*` aqui')).toEqual([
      t('use '),
      { type: 'mono', value: '*não negrito*' },
      t(' aqui'),
    ]);
    expect(parseFormatting('```linha 1\nlinha 2```')).toEqual([
      { type: 'block', value: 'linha 1\nlinha 2' },
    ]);
  });

  it('keeps text around a marked span', () => {
    expect(parseFormatting('um *dois* três')).toEqual([
      t('um '),
      { type: 'bold', children: [t('dois')] },
      t(' três'),
    ]);
  });

  it('nests formatting', () => {
    expect(parseFormatting('*negrito e _itálico_*')).toEqual([
      { type: 'bold', children: [t('negrito e '), { type: 'italic', children: [t('itálico')] }] },
    ]);
  });

  it('does not format when the marker touches a space or a word', () => {
    expect(parseFormatting('2 * 3 * 4')).toEqual([t('2 * 3 * 4')]);
    expect(parseFormatting('snake_case_name')).toEqual([t('snake_case_name')]);
    expect(parseFormatting('* x *')).toEqual([t('* x *')]);
  });

  it('does not span lines for inline markers', () => {
    expect(parseFormatting('*a\nb*')).toEqual([t('*a\nb*')]);
  });

  it('turns http(s) URLs into links and leaves trailing punctuation out', () => {
    expect(parseFormatting('veja https://exemplo.com/a_b_c, ok')).toEqual([
      t('veja '),
      { type: 'link', href: 'https://exemplo.com/a_b_c', label: 'https://exemplo.com/a_b_c' },
      t(', ok'),
    ]);
  });

  it('never creates a link for other schemes', () => {
    const nodes = parseFormatting('javascript:alert(1) data:text/html,x ftp://x');
    expect(nodes.some((n) => n.type === 'link')).toBe(false);
  });

  it('finds a link inside bold text', () => {
    const [bold] = parseFormatting('*acesse https://a.com agora*');
    expect(bold?.type === 'bold' && bold.children.some((c) => c.type === 'link')).toBe(true);
  });

  it('keeps unmatched markers as text', () => {
    expect(parseFormatting('*sem fim')).toEqual([t('*sem fim')]);
  });

  it('handles accented words next to markers', () => {
    expect(parseFormatting('é *ótimo*!')).toEqual([
      t('é '),
      { type: 'bold', children: [t('ótimo')] },
      t('!'),
    ]);
  });
});
