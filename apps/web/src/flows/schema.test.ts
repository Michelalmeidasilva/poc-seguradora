import { describe, expect, it } from 'vitest';
import cotacao from './fixtures/cotacao.flow.json';
import { entryScreen, parseFlow, screenById } from './schema';

type Json = Record<string, unknown>;

const footer = (action: Json = { name: 'complete', payload: {} }): Json => ({
  type: 'Footer',
  label: 'Ok',
  'on-click-action': action,
});
const goto = (name: string): Json => footer({ name: 'navigate', next: { type: 'screen', name } });
const screen = (id: string, children: Json[], extra: Json = {}): Json => ({
  id,
  title: id,
  layout: { type: 'SingleColumnLayout', children },
  ...extra,
});
const end = (id = 'END'): Json => screen(id, [footer()], { terminal: true });
const flow = (screens: Json[], extra: Json = {}): Json => ({ version: '6.2', screens, ...extra });
const body = (n: number): Json[] =>
  Array.from({ length: n }, (_, i) => ({ type: 'TextBody', text: `t${i}` }));
const options = (n: number): Json[] =>
  Array.from({ length: n }, (_, i) => ({ id: `o${i}`, title: `Option ${i}` }));
const ifOf = (then: Json[], otherwise?: Json[], condition = '${form.a} == 1'): Json => ({
  type: 'If',
  condition,
  then,
  ...(otherwise ? { else: otherwise } : {}),
});

function codes(raw: unknown): string[] {
  const r = parseFlow(raw);
  return r.ok ? [] : r.error.map((i) => i.code);
}

describe('parseFlow', () => {
  it('accepts the cotacao fixture', () => {
    const r = parseFlow(cotacao);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.screens.map((s) => s.id)).toEqual(['PRODUTO', 'DADOS']);
      expect(entryScreen(r.value).id).toBe('PRODUTO');
      expect(screenById(r.value, 'DADOS')?.terminal).toBe(true);
      expect(screenById(r.value, 'NOPE')).toBeUndefined();
    }
  });

  it('requires version', () => {
    expect(codes({ screens: [end()] })).toContain('version_required');
  });

  it('rejects duplicate screen ids', () => {
    expect(codes(flow([goto2('A', 'B'), end('B'), end('B')]))).toContain('duplicate_screen_id');
  });

  it('reserves the SUCCESS screen id', () => {
    expect(codes(flow([end('SUCCESS')]))).toContain('reserved_screen_id');
  });

  it('rejects 51 components on a screen, counting inside If and Switch', () => {
    expect(codes(flow([screen('END', [...body(51), footer()], { terminal: true })]))).toContain(
      'too_many_components',
    );
    const nested = [
      ifOf(
        [...body(26)],
        [...body(26)].map((c) => ({ ...c })),
      ),
      { type: 'Switch', value: '${form.a}', cases: { x: body(26) } },
    ];
    expect(codes(flow([screen('END', [...nested, footer()], { terminal: true })]))).toContain(
      'too_many_components',
    );
    expect(codes(flow([screen('END', [...body(49), footer()], { terminal: true })]))).toEqual([]);
  });

  it('rejects two Footers', () => {
    expect(codes(flow([screen('END', [footer(), footer()], { terminal: true })]))).toContain(
      'too_many_footers',
    );
  });

  it('rejects a Footer outside the If when a branch has one', () => {
    const children = [ifOf([footer()], [footer()]), footer()];
    expect(codes(flow([screen('END', children, { terminal: true })]))).toContain(
      'footer_outside_if',
    );
  });

  it('rejects If branches whose Footers do not match', () => {
    const children = [ifOf([footer()], body(1))];
    expect(codes(flow([screen('END', children, { terminal: true })]))).toContain(
      'if_footer_mismatch',
    );
    expect(codes(flow([screen('END', [ifOf([footer()])], { terminal: true })]))).toContain(
      'if_footer_mismatch',
    );
    const ok = [ifOf([footer()], [footer()])];
    expect(codes(flow([screen('END', ok, { terminal: true })]))).toEqual([]);
  });

  it('rejects If nested 4 levels but accepts 3', () => {
    const level = (n: number): Json =>
      n === 0 ? { type: 'TextBody', text: 'x' } : ifOf([level(n - 1)], [], '${form.a} == 1');
    expect(codes(flow([screen('END', [level(4), footer()], { terminal: true })]))).toContain(
      'nesting_too_deep',
    );
    expect(codes(flow([screen('END', [level(3), footer()], { terminal: true })]))).toEqual([]);
  });

  it('requires a Footer on a terminal screen', () => {
    expect(codes(flow([screen('END', body(1), { terminal: true })]))).toContain(
      'terminal_requires_footer',
    );
  });

  it('forbids navigate in a terminal Footer', () => {
    const f = flow([screen('END', [goto('END')], { terminal: true })]);
    expect(codes(f)).toContain('navigate_in_terminal');
  });

  it('rejects navigate to an unknown screen', () => {
    expect(codes(flow([screen('A', [goto('GHOST')]), end()]))).toContain('unknown_screen');
  });

  describe('routing_model', () => {
    const two = [screen('A', [goto('END')]), end()];

    it('accepts a valid model', () => {
      expect(codes(flow(two, { routing_model: { A: ['END'] } }))).toEqual([]);
    });

    it('rejects an edge to an unknown screen', () => {
      expect(codes(flow(two, { routing_model: { A: ['END', 'GHOST'] } }))).toContain(
        'unknown_screen',
      );
      expect(codes(flow(two, { routing_model: { GHOST: ['END'] } }))).toContain('unknown_screen');
    });

    it('rejects more than 10 edges from a screen', () => {
      const ids = Array.from({ length: 11 }, (_, i) => `T${i}`);
      const screens = [screen('A', [goto('T0')]), ...ids.map((id) => end(id))];
      expect(codes(flow(screens, { routing_model: { A: ids } }))).toContain('too_many_branches');
    });

    it('rejects a cycle', () => {
      const screens = [screen('A', [goto('B')]), screen('B', [goto('A')]), end()];
      expect(codes(flow(screens, { routing_model: { A: ['B'], B: ['A', 'END'] } }))).toContain(
        'routing_cycle',
      );
    });

    it('rejects a screen unreachable from the entry', () => {
      const screens = [screen('A', [goto('END')]), screen('C', [goto('END')]), end()];
      expect(codes(flow(screens, { routing_model: { A: ['END'], C: ['END'] } }))).toContain(
        'unreachable_screen',
      );
    });

    it('rejects a model with no entry screen', () => {
      const screens = [screen('A', [goto('B')]), screen('B', [goto('A')])];
      expect(codes(flow(screens, { routing_model: { A: ['B'], B: ['A'] } }))).toContain(
        'no_entry_screen',
      );
    });

    it('rejects a non-terminal screen without outgoing edges', () => {
      const screens = [screen('A', body(1)), end()];
      expect(codes(flow(screens, { routing_model: { A: [] } }))).toContain('dead_end');
    });

    it('derives edges from navigate actions when the model is absent', () => {
      const cyc = [screen('A', [goto('B')]), screen('B', [goto('A')]), end()];
      expect(codes(flow(cyc))).toContain('routing_cycle');
      const orphan = [screen('A', [goto('END')]), end(), end('LOST')];
      expect(codes(flow(orphan))).toContain('unreachable_screen');
    });
  });

  it('allows one picker per screen, never two', () => {
    const picker = (type: string): Json => ({
      type,
      name: 'p',
      label: 'Foto',
      'max-uploaded-photos': 1,
    });
    const mk = (kids: Json[]): Json =>
      flow([screen('END', [...kids, footer()], { terminal: true })]);
    expect(codes(mk([picker('PhotoPicker')]))).toEqual([]);
    expect(codes(mk([picker('PhotoPicker'), picker('PhotoPicker')]))).toContain('too_many_pickers');
    expect(codes(mk([picker('PhotoPicker'), picker('DocumentPicker')]))).toContain(
      'too_many_pickers',
    );
  });

  it('limits option counts', () => {
    const mk = (c: Json): Json => flow([screen('END', [c, footer()], { terminal: true })]);
    const group = (n: number): Json => ({
      type: 'CheckboxGroup',
      name: 'g',
      label: 'G',
      'data-source': options(n),
    });
    const drop = (n: number): Json => ({
      type: 'Dropdown',
      name: 'd',
      label: 'D',
      'data-source': options(n),
    });
    expect(codes(mk(group(20)))).toEqual([]);
    expect(codes(mk(group(21)))).toContain('invalid_option_count');
    expect(codes(mk(group(0)))).toContain('invalid_option_count');
    expect(codes(mk(drop(200)))).toEqual([]);
    expect(codes(mk(drop(201)))).toContain('invalid_option_count');
  });

  it('limits per-type component counts', () => {
    const mk = (kids: Json[]): Json =>
      flow([screen('END', [...kids, footer()], { terminal: true })]);
    const link = {
      type: 'EmbeddedLink',
      text: 'x',
      'on-click-action': { name: 'open_url', url: 'https://a.b' },
    };
    const img = { type: 'Image', src: 'https://a.b/i.png' };
    const optin = { type: 'OptIn', name: 'o', label: 'O' };
    expect(codes(mk([link, link, link]))).toContain('too_many_embedded_links');
    expect(codes(mk([img, img, img, img]))).toContain('too_many_images');
    expect(codes(mk(Array(6).fill(optin)))).toContain('too_many_opt_ins');
  });

  it('limits text lengths', () => {
    const mk = (c: Json): Json => flow([screen('END', [c, footer()], { terminal: true })]);
    expect(codes(mk({ type: 'TextHeading', text: 'x'.repeat(81) }))).toContain('text_too_long');
    expect(codes(mk({ type: 'TextSubheading', text: 'x'.repeat(80) }))).toEqual([]);
    expect(codes(mk({ type: 'TextCaption', text: 'x'.repeat(410) }))).toContain('text_too_long');
    expect(codes(mk({ type: 'TextBody', text: 'x'.repeat(4097) }))).toContain('text_too_long');
  });

  it('caps RichText per line, in total and in lines', () => {
    const mk = (text: unknown): Json =>
      flow([screen('END', [{ type: 'RichText', text }, footer()], { terminal: true })]);
    const line = (n: number) => 'x'.repeat(n);
    expect(codes(mk(line(4096)))).toEqual([]);
    expect(codes(mk(line(4097)))).toContain('rich_text_too_long');
    expect(codes(mk([line(10), line(4097)]))).toContain('rich_text_too_long');
    // 4 x 3999 + 4000 + 4 newlines = 20000 (the total cap); one more char overflows
    const lines = (last: number) => [...Array.from({ length: 4 }, () => line(3999)), line(last)];
    expect(codes(mk(lines(4000)))).toEqual([]);
    expect(codes(mk(lines(4001)))).toContain('rich_text_too_long');
    expect(codes(mk(Array.from({ length: 100 }, () => 'a')))).toEqual([]);
    expect(codes(mk(Array.from({ length: 101 }, () => 'a')))).toContain('rich_text_too_many_lines');
    expect(codes(mk(Array.from({ length: 101 }, () => 'a').join('\n')))).toContain(
      'rich_text_too_many_lines',
    );
  });

  it('requires a dynamic value in If conditions', () => {
    const f = flow([
      screen('END', [ifOf(body(1), undefined, '1 == 1'), ifOf([])], { terminal: true }),
    ]);
    expect(codes(f)).toContain('condition_not_dynamic');
  });

  it('keeps unknown component types without failing', () => {
    const f = flow([screen('END', [{ type: 'Hologram', foo: 1 }, footer()], { terminal: true })]);
    const r = parseFlow(f);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.screens[0]?.layout.children[0]).toMatchObject({ type: 'Hologram' });
    expect(codes(flow([screen('END', [{ nope: 1 }, footer()], { terminal: true })]))).toContain(
      'invalid_component',
    );
  });

  it.each(['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty'])(
    'keeps a component of type %s as unknown',
    (type) => {
      const odd = JSON.parse(`{"type":"${type}"}`) as Json;
      const top = flow([screen('END', [odd, footer()], { terminal: true })]);
      expect(parseFlow(top).ok).toBe(true);
      const inIf = flow([screen('END', [ifOf([odd, footer()], [footer()])], { terminal: true })]);
      expect(parseFlow(inIf).ok).toBe(true);
    },
  );

  it('rejects Switch cases whose Footers do not match', () => {
    const sw = { type: 'Switch', value: '${form.a}', cases: { x: [footer()], y: body(1) } };
    expect(codes(flow([screen('END', [sw], { terminal: true })]))).toContain(
      'switch_footer_mismatch',
    );
  });

  it('counts If and Switch together towards nesting', () => {
    const sw = (inner: Json): Json => ({
      type: 'Switch',
      value: '${form.a}',
      cases: { x: [inner] },
    });
    const deep = ifOf([sw(ifOf([sw(body(1)[0]!)]))]);
    expect(codes(flow([screen('END', [deep, footer()], { terminal: true })]))).toContain(
      'nesting_too_deep',
    );
  });

  it('rejects a routing_model that is not an object', () => {
    expect(codes(flow([end()], { routing_model: [] }))).toContain('invalid_routing_model');
    expect(codes(flow([end()], { routing_model: { END: 'x' } }))).toContain(
      'invalid_routing_model',
    );
  });

  it('rejects malformed actions', () => {
    const bad = flow([screen('END', [footer({ name: 'teleport' })], { terminal: true })]);
    expect(codes(bad)).toContain('invalid_action');
  });

  it.each([[null], [[]], ['text'], [42], [undefined]])('rejects non-object %j', (input) => {
    const r = parseFlow(input);
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.error).toEqual([expect.objectContaining({ code: 'not_an_object', path: '' })]);
  });

  it('rejects input over 512 KB without walking it', () => {
    const huge = flow([screen('END', [{ type: 'TextBody', text: 'x'.repeat(600_000) }, footer()])]);
    const r = parseFlow(huge);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.map((i) => i.code)).toEqual(['too_large']);
  });

  it('rejects cyclic input as not serializable', () => {
    const loop: Json = { version: '6.2' };
    loop.self = loop;
    expect(codes(loop)).toEqual(['not_serializable']);
  });
});

function goto2(id: string, to: string): Json {
  return screen(id, [goto(to)]);
}
