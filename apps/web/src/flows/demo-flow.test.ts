import { describe, expect, it } from 'vitest';
import { REGISTERED_TYPES } from './components/registry';
import cotacao from './fixtures/cotacao.flow.json';
import demo from './fixtures/demo-componentes.flow.json';
import { unknownFormRefs } from './runtime';
import { type FlowJson, parseFlow } from './schema';

type Node = Record<string, unknown>;

function collectTypes(list: unknown, into: Set<string>): void {
  if (!Array.isArray(list)) return;
  for (const c of list as Node[]) {
    if (typeof c.type !== 'string') continue;
    into.add(c.type);
    if (c.type === 'If') {
      collectTypes(c.then, into);
      collectTypes(c.else, into);
    } else if (c.type === 'Switch') {
      for (const branch of Object.values(c.cases as Record<string, unknown>)) {
        collectTypes(branch, into);
      }
    }
  }
}

function collectActions(value: unknown, into: Set<string>): void {
  if (Array.isArray(value)) value.forEach((v) => collectActions(v, into));
  else if (typeof value === 'object' && value !== null) {
    for (const [k, v] of Object.entries(value)) {
      if (/^on-.+-action$/.test(k) && typeof (v as Node).name === 'string') {
        into.add((v as Node).name as string);
      }
      collectActions(v, into);
    }
  }
}

describe('demo-componentes flow', () => {
  it('is a valid Flow JSON 7.1', () => {
    const r = parseFlow(demo);
    expect(r.ok ? [] : r.error).toEqual([]);
    expect(demo.version).toBe('7.1');
  });

  it('opens: the demo and cotação Flows reference only declared form fields', () => {
    expect(unknownFormRefs(demo as unknown as FlowJson)).toEqual([]);
    expect(unknownFormRefs(cotacao as unknown as FlowJson)).toEqual([]);
  });

  it('uses exactly the component types the registry implements', () => {
    const used = new Set<string>();
    for (const screen of demo.screens) collectTypes(screen.layout.children, used);
    expect([...used].sort()).toEqual([...REGISTERED_TYPES].sort());
  });

  it('uses every action', () => {
    const used = new Set<string>();
    collectActions(demo.screens, used);
    expect([...used].sort()).toEqual(
      ['complete', 'data_exchange', 'navigate', 'open_url', 'update_data'].sort(),
    );
  });

  it('covers both CalendarPicker modes', () => {
    const modes = new Set<unknown>();
    for (const screen of demo.screens) {
      for (const c of screen.layout.children as Node[]) {
        if (c.type === 'CalendarPicker') modes.add(c.mode);
      }
    }
    expect(modes).toEqual(new Set(['single', 'range']));
  });
});
