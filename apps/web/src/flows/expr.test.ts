import { describe, expect, it } from 'vitest';
import { evalCondition, hasDynamicValue, interpolate, resolveValue, type Scope } from './expr';

const scope: Scope = {
  data: { a: { b: 'x', list: [1, 2] }, n: 5, t: true, f: false, s: 'abc', z: null },
  form: { n: 3, name: 'Ana', ok: true, arr: ['p', 'q'] },
};

const cond = (src: string) => evalCondition(src, scope);

describe('evalCondition', () => {
  const cases: [string, boolean][] = [
    ['true', true],
    ['false', false],
    ['${data.t}', true],
    ['${data.f}', false],
    ["${data.a.b} == 'x'", true],
    ['${data.a.b} == "y"', false],
    ["${data.a.b} != 'y'", true],
    ["${data.a.b} != 'x'", false],
    ['${form.n} == 3', true],
    ['${form.n} != 3', false],
    ["'1' == 1", false],
    ["'1' != 1", true],
    ['null == null', true],
    ['${data.missing} == null', true],
    ['${data.n} > 4', true],
    ['${data.n} > 5', false],
    ['${data.n} >= 5', true],
    ['${data.n} >= 6', false],
    ['${data.n} < 6', true],
    ['${data.n} < 5', false],
    ['${data.n} <= 5', true],
    ['${data.n} <= 4', false],
    ['!true', false],
    ['!false', true],
    ['!${data.missing}', true],
    ['!${data.t}', false],
    ['!!true', true],
    ['true || false', true],
    ['false || false', false],
    ['true && false', false],
    ['true && true', true],
    ['true || false && false', true],
    ['false && false || true', true],
    ['(true || false) && false', false],
    ['(false || true) && true', true],
    ["'a && b' == 'a && b'", true],
    ["${data.s} == 'a || b'", false],
    ['${data.n} > 1 && ${form.n} < 4', true],
    ['${data.n} == 5 == true', true],
    ['false && 1 > ${data.s}', false],
    ['  ( ${form.ok} )  ', true],
    ['${data.constructor} == null', true],
    ['${data.__proto__} == null', true],
    ['${data.toString} == null', true],
    ['${data.a.constructor.name} == null', true],
    ['${data.a.b.length} == null', true],
    ['${data.a.list.length} == null', true],
    ['${form.hasOwnProperty} == null', true],
  ];
  it.each(cases)('%s -> %s', (src, expected) => {
    expect(cond(src)).toEqual({ ok: true, value: expected });
  });

  const errors: [string, string?][] = [
    ['${data.a[0]}'],
    ['${data.a.list[0]} == 1'],
    ['1 +'],
    ['1 + 1'],
    [''],
    ['   '],
    ['(true'],
    ['true)'],
    ['true true'],
    ["'unterminated"],
    ['${data.a'],
    ['${other.a}'],
    ['${data.}'],
    ['${data..a}'],
    ['true & false'],
    ['true | false'],
    ['a == b'],
    ['`x`'],
    ['1.2.3 == 1'],
    ['x'.repeat(501), 'too_long'],
    [`${'('.repeat(25)}true${')'.repeat(25)}`, 'too_deep'],
    [`${'!'.repeat(25)}true`, 'too_deep'],
    ['1', 'not_boolean'],
    ["'a'", 'not_boolean'],
    ['null', 'not_boolean'],
    ['${data.missing}', 'not_boolean'],
    ['${data.a}', 'not_boolean'],
    ['${data.s} > 1', 'type_mismatch'],
    ["'a' < 'b'", 'type_mismatch'],
    ['${data.missing} >= 1', 'type_mismatch'],
  ];
  it.each(errors)('%s -> error', (src, code) => {
    const r = cond(src);
    expect(r.ok).toBe(false);
    if (code && !r.ok) expect(r.error).toBe(code);
  });

  it('accepts depth 20 and rejects 21', () => {
    expect(cond(`${'('.repeat(20)}true${')'.repeat(20)}`).ok).toBe(true);
    expect(cond(`${'('.repeat(21)}true${')'.repeat(21)}`).ok).toBe(false);
  });

  it('accepts exactly 500 chars', () => {
    const src = `true${' '.repeat(496)}`;
    expect(src).toHaveLength(500);
    expect(cond(src)).toEqual({ ok: true, value: true });
  });

  it('never throws on weird input', () => {
    const weird: unknown[] = [undefined, null, 5, {}, [], Symbol('x'), 'x'.repeat(1e6), '\u0000'];
    for (const w of weird) expect(evalCondition(w as string, scope).ok).toBe(false);
    expect(evalCondition('true', null as unknown as Scope).ok).toBe(true);
    expect(evalCondition('${data.a} == null', null as unknown as Scope)).toEqual({
      ok: true,
      value: true,
    });
    expect(evalCondition('${data.a} == null', { data: 1, form: 'x' } as unknown as Scope).ok).toBe(
      true,
    );
  });
});

describe('interpolate', () => {
  it.each([
    ['Olá ${form.name}!', 'Olá Ana!'],
    ['${data.a.b}', 'x'],
    ['${data.a.b}-${form.n}', 'x-3'],
    ['sem nada', 'sem nada'],
    ['${data.missing}', ''],
    ['a${data.a.nope.deep}b', 'ab'],
    ['${data.constructor}', ''],
    ['${data.__proto__}', ''],
    ['${form.toString}', ''],
    ['${data.a.list}', '[1,2]'],
    ['${data.t}', 'true'],
    ['${data.z}', ''],
    ['${data.a[0]}', '${data.a[0]}'],
    ['${nope.x}', '${nope.x}'],
    ['${data.a', '${data.a'],
    ['$', '$'],
    ['${}', '${}'],
  ])('%s -> %s', (tpl, out) => {
    expect(interpolate(tpl, scope)).toBe(out);
  });

  it('is total', () => {
    expect(interpolate(5 as unknown as string, scope)).toBe('');
    expect(interpolate(undefined as unknown as string, scope)).toBe('');
    expect(interpolate('${data.a}', null as unknown as Scope)).toBe('');
    expect(interpolate('${data.x}'.repeat(50000), scope)).toBe('');
  });
});

describe('resolveValue', () => {
  it('keeps types for a single reference', () => {
    expect(resolveValue('${form.n}', scope)).toBe(3);
    expect(resolveValue('${form.ok}', scope)).toBe(true);
    expect(resolveValue('${form.arr}', scope)).toEqual(['p', 'q']);
    expect(resolveValue('${data.missing}', scope)).toBeNull();
    expect(resolveValue('${data.constructor}', scope)).toBeNull();
  });
  it('interpolates mixed text', () => {
    expect(resolveValue('Olá ${form.n}!', scope)).toBe('Olá 3!');
    expect(resolveValue('${form.n}${form.n}', scope)).toBe('33');
  });
  it('passes through non-strings and resolves recursively', () => {
    expect(resolveValue(7, scope)).toBe(7);
    expect(resolveValue(null, scope)).toBeNull();
    expect(resolveValue(undefined, scope)).toBeUndefined();
    expect(
      resolveValue({ a: '${form.n}', b: ['${form.name}', 1, { c: '${data.t}' }], d: 'x' }, scope),
    ).toEqual({ a: 3, b: ['Ana', 1, { c: true }], d: 'x' });
  });
  it('keeps __proto__ keys as own data, never changing the prototype', () => {
    const input = JSON.parse('{"__proto__": {"polluted": "${form.n}"}}') as unknown;
    const out = resolveValue(input, scope) as Record<string, unknown>;
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(Object.hasOwn(out, '__proto__')).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it('is total on deep and cyclic input', () => {
    const cyc: Record<string, unknown> = {};
    cyc.self = cyc;
    expect(() => resolveValue(cyc, scope)).not.toThrow();
    let deep: unknown = 'x';
    for (let i = 0; i < 10000; i++) deep = [deep];
    expect(() => resolveValue(deep, scope)).not.toThrow();
  });
});

describe('hasDynamicValue', () => {
  it.each([
    ['${data.a}', true],
    ['x ${form.n} y', true],
    ['${data}', false],
    ['${other.a}', false],
    ['plain', false],
    ['', false],
  ])('%s -> %s', (src, expected) => {
    expect(hasDynamicValue(src)).toBe(expected);
  });
  it('is total', () => {
    expect(hasDynamicValue(5 as unknown as string)).toBe(false);
    expect(hasDynamicValue(null as unknown as string)).toBe(false);
  });
});
