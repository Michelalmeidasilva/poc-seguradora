import { describe, expect, it } from 'vitest';
import { parseFlow } from './schema';
import { unknownFormRefs } from './runtime';
import { REGISTERED_TYPES } from './components/registry';
import { showcaseFlow } from './showcase-flow';

describe('local insurance component showcase', () => {
  it('opens with valid screens, one media picker per screen and declared field references', () => {
    const parsed = parseFlow(showcaseFlow('https://seguradora.example'));
    expect(parsed.ok ? [] : parsed.error).toEqual([]);
    if (!parsed.ok) return;
    expect(unknownFormRefs(parsed.value)).toEqual([]);
    const types = new Set<string>();
    const visit = (value: unknown) => {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') {
        const object = value as Record<string, unknown>;
        if (typeof object.type === 'string' && REGISTERED_TYPES.includes(object.type))
          types.add(object.type);
        Object.values(object).forEach(visit);
      }
    };
    visit(parsed.value.screens);
    expect([...types].sort()).toEqual([...REGISTERED_TYPES].sort());
  });
});
