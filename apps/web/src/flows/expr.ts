import { err, ok, type Result } from '@seguradora/protocol';

export type Scope = { data: Record<string, unknown>; form: Record<string, unknown> };

const MAX_SOURCE = 500;
const MAX_DEPTH = 20;
const MAX_VALUE_DEPTH = 64;

const isDigit = (c: string): boolean => c >= '0' && c <= '9';
const isIdentStart = (c: string): boolean =>
  (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
const isIdentChar = (c: string): boolean => isIdentStart(c) || isDigit(c);

type Ref = { path: string[]; end: number };

/** Parses `${data.a.b}` / `${form.x}` starting at `start`; null when malformed. */
const parseRef = (s: string, start: number): Ref | null => {
  if (s[start] !== '$' || s[start + 1] !== '{') return null;
  const path: string[] = [];
  let i = start + 2;
  for (;;) {
    const from = i;
    if (i >= s.length || !isIdentStart(s[i] as string)) return null;
    while (i < s.length && isIdentChar(s[i] as string)) i++;
    path.push(s.slice(from, i));
    if (s[i] === '.') {
      i++;
      continue;
    }
    break;
  }
  if (s[i] !== '}' || path.length < 2) return null;
  if (path[0] !== 'data' && path[0] !== 'form') return null;
  return { path, end: i + 1 };
};

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Own-property walk: prototype keys and array members resolve to null. */
const lookup = (scope: Scope, path: string[]): unknown => {
  let cur: unknown = isPlainObject(scope) ? scope[path[0] as 'data' | 'form'] : undefined;
  for (let i = 1; i < path.length; i++) {
    const key = path[i] as string;
    if (!isPlainObject(cur) || !Object.hasOwn(cur, key)) return null;
    cur = cur[key];
  }
  return cur === undefined ? null : cur;
};

const stringify = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v) ?? '';
    } catch {
      return '';
    }
  }
  if (typeof v === 'symbol' || typeof v === 'function') return '';
  return String(v as number | boolean | bigint);
};

export const hasDynamicValue = (source: string): boolean =>
  typeof source === 'string' && (source.includes('${data.') || source.includes('${form.'));

export const interpolate = (template: string, scope: Scope): string => {
  if (typeof template !== 'string') return '';
  try {
    const parts: string[] = [];
    let last = 0;
    let i = template.indexOf('${');
    while (i !== -1) {
      const ref = parseRef(template, i);
      if (ref) {
        parts.push(template.slice(last, i), stringify(lookup(scope, ref.path)));
        last = ref.end;
        i = template.indexOf('${', last);
      } else {
        i = template.indexOf('${', i + 2);
      }
    }
    parts.push(template.slice(last));
    return parts.join('');
  } catch {
    return '';
  }
};

const resolveDeep = (value: unknown, scope: Scope, depth: number): unknown => {
  if (typeof value === 'string') {
    const ref = parseRef(value, 0);
    if (ref && ref.end === value.length) return lookup(scope, ref.path);
    return interpolate(value, scope);
  }
  if (depth >= MAX_VALUE_DEPTH) return null;
  if (Array.isArray(value)) return value.map((v) => resolveDeep(v, scope, depth + 1));
  if (isPlainObject(value)) {
    // fromEntries defines own properties, so a "__proto__" key stays plain data.
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, resolveDeep(v, scope, depth + 1)]),
    );
  }
  return value;
};

export const resolveValue = (value: unknown, scope: Scope): unknown => {
  try {
    return resolveDeep(value, scope, 0);
  } catch {
    return null;
  }
};

// --- conditions ---

type Token =
  | { t: 'ref'; path: string[] }
  | { t: 'lit'; v: string | number | boolean | null }
  | { t: 'op'; v: string }
  | { t: '(' | ')' };

const tokenize = (s: string): Token[] | null => {
  const out: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i] as string;
    const next = s[i + 1];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
    } else if (c === '(' || c === ')') {
      out.push({ t: c });
      i++;
    } else if (c === '$') {
      const ref = parseRef(s, i);
      if (!ref) return null;
      out.push({ t: 'ref', path: ref.path });
      i = ref.end;
    } else if (c === "'" || c === '"') {
      const close = s.indexOf(c, i + 1);
      if (close === -1) return null;
      out.push({ t: 'lit', v: s.slice(i + 1, close) });
      i = close + 1;
    } else if (isDigit(c) || (c === '-' && next !== undefined && isDigit(next))) {
      const from = i;
      i++;
      while (i < s.length && isDigit(s[i] as string)) i++;
      if (s[i] === '.' && isDigit(s[i + 1] ?? '')) {
        i++;
        while (i < s.length && isDigit(s[i] as string)) i++;
      }
      out.push({ t: 'lit', v: Number(s.slice(from, i)) });
    } else if (isIdentStart(c)) {
      const from = i;
      while (i < s.length && isIdentChar(s[i] as string)) i++;
      const word = s.slice(from, i);
      if (word === 'true') out.push({ t: 'lit', v: true });
      else if (word === 'false') out.push({ t: 'lit', v: false });
      else if (word === 'null') out.push({ t: 'lit', v: null });
      else return null;
    } else {
      const two = next === undefined ? '' : c + next;
      if (
        two === '||' ||
        two === '&&' ||
        two === '==' ||
        two === '!=' ||
        two === '>=' ||
        two === '<='
      ) {
        out.push({ t: 'op', v: two });
        i += 2;
      } else if (c === '>' || c === '<' || c === '!') {
        out.push({ t: 'op', v: c });
        i++;
      } else {
        return null;
      }
    }
  }
  return out;
};

type Node =
  | { k: 'ref'; path: string[] }
  | { k: 'lit'; v: unknown }
  | { k: 'not'; a: Node }
  | { k: 'bin'; op: string; a: Node; b: Node };

class ParseError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

const parse = (tokens: Token[]): Node => {
  let pos = 0;
  const peekOp = (...ops: string[]): string | null => {
    const tk = tokens[pos];
    return tk && tk.t === 'op' && ops.includes(tk.v) ? tk.v : null;
  };
  const level =
    (ops: string[], sub: (d: number) => Node) =>
    (d: number): Node => {
      let left = sub(d);
      for (let op = peekOp(...ops); op; op = peekOp(...ops)) {
        pos++;
        left = { k: 'bin', op, a: left, b: sub(d) };
      }
      return left;
    };
  const unary = (d: number): Node => {
    if (d > MAX_DEPTH) throw new ParseError('too_deep');
    if (peekOp('!')) {
      pos++;
      return { k: 'not', a: unary(d + 1) };
    }
    return primary(d);
  };
  const primary = (d: number): Node => {
    const tk = tokens[pos++];
    if (!tk) throw new ParseError('syntax');
    if (tk.t === 'ref') return { k: 'ref', path: tk.path };
    if (tk.t === 'lit') return { k: 'lit', v: tk.v };
    if (tk.t === '(') {
      if (d + 1 > MAX_DEPTH) throw new ParseError('too_deep');
      const inner = orExpr(d + 1);
      if (tokens[pos++]?.t !== ')') throw new ParseError('syntax');
      return inner;
    }
    throw new ParseError('syntax');
  };
  const relational = level(['>', '>=', '<', '<='], unary);
  const equality = level(['==', '!='], relational);
  const andExpr = level(['&&'], equality);
  const orExpr = level(['||'], andExpr);
  const root = orExpr(0);
  if (pos !== tokens.length) throw new ParseError('syntax');
  return root;
};

const evaluate = (node: Node, scope: Scope): unknown => {
  switch (node.k) {
    case 'ref':
      return lookup(scope, node.path);
    case 'lit':
      return node.v;
    case 'not':
      return !evaluate(node.a, scope);
    case 'bin': {
      if (node.op === '||')
        return Boolean(evaluate(node.a, scope)) || Boolean(evaluate(node.b, scope));
      if (node.op === '&&')
        return Boolean(evaluate(node.a, scope)) && Boolean(evaluate(node.b, scope));
      const a = evaluate(node.a, scope);
      const b = evaluate(node.b, scope);
      if (node.op === '==') return a === b;
      if (node.op === '!=') return a !== b;
      if (typeof a !== 'number' || typeof b !== 'number') throw new ParseError('type_mismatch');
      if (node.op === '>') return a > b;
      if (node.op === '>=') return a >= b;
      if (node.op === '<') return a < b;
      return a <= b;
    }
  }
};

export const evalCondition = (source: string, scope: Scope): Result<boolean, string> => {
  try {
    if (typeof source !== 'string') return err('syntax');
    if (source.length > MAX_SOURCE) return err('too_long');
    const tokens = tokenize(source);
    if (!tokens || tokens.length === 0) return err('syntax');
    const result = evaluate(parse(tokens), scope);
    return typeof result === 'boolean' ? ok(result) : err('not_boolean');
  } catch (e) {
    return err(e instanceof ParseError ? e.code : 'syntax');
  }
};
