import {
  readFileSync,
  existsSync,
  realpathSync,
  readdirSync,
  lstatSync,
  readlinkSync,
} from 'node:fs';
import { posix, join, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

export const STATUSES = ['not_started', 'in_progress', 'blocked', 'done'];
export const OWNER_RE = /^(claude|codex|cursor|antigravity|human:[^\s|]+|-)$/;
export const HEADER = [
  'Workstream',
  'Caminho',
  'Status',
  'Dono',
  'Branch',
  'Iniciado',
  'Atualizado',
  'Notas',
];
export const POINTERS = [
  'CLAUDE.md',
  'GEMINI.md',
  '.cursor/rules/workboard.mdc',
  '.github/copilot-instructions.md',
];
export const SKILL_REAL = '.agents/skills/workboard-protocol';
export const SKILL_LINKS = [
  '.claude/skills/workboard-protocol',
  '.agent/skills/workboard-protocol',
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SEPARATOR_RE = /^\|(\s*:?-+:?\s*\|)+\s*$/;

export function isRealDate(value) {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// Normalizes a board path; returns null when it is empty, absolute or escapes the repo root.
export function normalizePath(p) {
  if (p === '' || p.startsWith('/')) return null;
  const n = posix.normalize(p).replace(/\/+$/, '');
  if (n === '' || n === '.' || n === '..' || n.startsWith('../')) return null;
  return n;
}

const splitCells = (line) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());

export function parseWorkboard(text) {
  const errors = [];
  const lines = text.split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => l.trim().startsWith('| Workstream'));
  if (headerIdx === -1) return { rows: [], errors: ['header row not found'] };

  const header = splitCells(lines[headerIdx]);
  if (header.join('|') !== HEADER.join('|')) {
    errors.push(`header must be: ${HEADER.join(' | ')}`);
  }

  const sepLine = lines[headerIdx + 1] ?? '';
  const hasSeparator = SEPARATOR_RE.test(sepLine.trim());
  if (!hasSeparator) errors.push(`line ${headerIdx + 2}: separator row missing or malformed`);

  const rows = [];
  let i = hasSeparator ? headerIdx + 2 : headerIdx + 1;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim().startsWith('|')) break;
    const c = splitCells(line);
    if (c.length !== HEADER.length) {
      errors.push(`line ${i + 1}: expected ${HEADER.length} columns, got ${c.length}`);
      continue;
    }
    rows.push({
      line: i + 1,
      workstream: c[0],
      paths: c[1]
        .replace(/`/g, '')
        .split(',')
        .map((p) => p.trim()),
      status: c[2],
      owner: c[3],
      branch: c[4],
      started: c[5],
      updated: c[6],
      notes: c[7],
    });
  }
  for (let j = i; j < lines.length; j++) {
    if (lines[j].trim().startsWith('|')) {
      errors.push(`table line after the end of the table at line ${j + 1}`);
    }
  }
  return { rows, errors };
}

const segments = (p) => (normalizePath(p) ?? p).split('/');

export function overlaps(a, b) {
  const x = segments(a);
  const y = segments(b);
  const n = Math.min(x.length, y.length);
  return x.slice(0, n).join('/') === y.slice(0, n).join('/');
}

const validPair = (a, b) => normalizePath(a) !== null && normalizePath(b) !== null;

export function validateRows(rows, exists = () => true) {
  const errors = [];
  const seen = new Set();

  for (const r of rows) {
    const at = `line ${r.line} (${r.workstream})`;
    if (seen.has(r.workstream)) errors.push(`${at}: duplicate workstream`);
    seen.add(r.workstream);

    if (!STATUSES.includes(r.status)) errors.push(`${at}: invalid status "${r.status}"`);
    if (!OWNER_RE.test(r.owner)) errors.push(`${at}: invalid owner "${r.owner}"`);

    const started = r.status !== 'not_started';
    if (r.status !== 'not_started' && r.owner === '-') {
      errors.push(`${at}: ${r.status} requires an owner`);
    }
    if (r.status === 'in_progress' || r.status === 'blocked') {
      if (r.branch === '-' || r.branch === '') errors.push(`${at}: ${r.status} requires a branch`);
    }
    if (r.status === 'not_started' && r.owner !== '-') {
      errors.push(`${at}: not_started must not have an owner`);
    }
    for (const [label, value] of [
      ['Iniciado', r.started],
      ['Atualizado', r.updated],
    ]) {
      if (isRealDate(value)) continue;
      if (value === '-' && !started) continue;
      errors.push(
        `${at}: ${label} must be a real date (YYYY-MM-DD)${started ? '' : ' or "-"'}, got "${value}"`,
      );
    }
    if (r.paths.length === 0) errors.push(`${at}: at least one path is required`);
    for (const p of r.paths) {
      const n = normalizePath(p);
      if (n === null) {
        errors.push(`${at}: invalid path "${p}" (must be non-empty, relative and inside the repo)`);
      } else if (!exists(n)) {
        errors.push(`${at}: path "${p}" does not exist`);
      }
    }
  }

  const active = rows.filter((r) => r.status !== 'done');
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      const clash = a.paths.some((pa) =>
        b.paths.some((pb) => validPair(pa, pb) && overlaps(pa, pb)),
      );
      if (clash) errors.push(`paths overlap: ${a.workstream} and ${b.workstream}`);
    }
  }
  return errors;
}

export function checkRepo(root) {
  const wbFile = join(root, 'WORKBOARD.md');
  if (!existsSync(wbFile)) return ['WORKBOARD.md not found'];

  const { rows, errors: parseErrors } = parseWorkboard(readFileSync(wbFile, 'utf8'));
  const errors = [...parseErrors, ...validateRows(rows, (p) => existsSync(join(root, p)))];

  if (!existsSync(join(root, 'AGENTS.md'))) errors.push('AGENTS.md not found');
  for (const p of POINTERS) {
    const f = join(root, p);
    if (!existsSync(f)) errors.push(`${p} not found`);
    else if (!readFileSync(f, 'utf8').includes('AGENTS.md')) {
      errors.push(`${p} must mention AGENTS.md`);
    }
  }

  const skillRoot = join(root, '.agents/skills');
  if (!existsSync(join(root, SKILL_REAL))) errors.push(`${SKILL_REAL} not found`);
  const names = existsSync(skillRoot)
    ? readdirSync(skillRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    : [];
  for (const name of names) {
    const path = `.agents/skills/${name}`;
    const real = join(root, path);
    const skillFile = join(real, 'SKILL.md');
    if (!existsSync(skillFile)) errors.push(`${path}/SKILL.md not found`);
    else {
      const body = readFileSync(skillFile, 'utf8');
      const frontmatter = body.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
      const field = (key) =>
        frontmatter
          ?.match(new RegExp(`^${key}:\\s*(.*?)\\s*$`, 'm'))?.[1]
          .replace(/^['"]|['"]$/g, '')
          .trim();
      if (field('name') !== name) errors.push(`${path}/SKILL.md name must be ${name}`);
      if (!field('description')) errors.push(`${path}/SKILL.md description must be non-empty`);
    }
    for (const tool of ['.claude', '.agent']) {
      const link = `${tool}/skills/${name}`;
      const file = join(root, link);
      if (!existsSync(file)) errors.push(`${link} missing`);
      else if (!lstatSync(file).isSymbolicLink() || isAbsolute(readlinkSync(file))) {
        errors.push(`${link} must be a relative symlink to ${path}`);
      } else if (realpathSync(file) !== realpathSync(real))
        errors.push(`${link} must resolve to ${path}`);
    }
  }
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[2] ?? '.');
  const errors = checkRepo(root);
  if (errors.length > 0) {
    console.error(errors.map((e) => `workboard-check: ${e}`).join('\n'));
    process.exit(1);
  }
  console.log('workboard-check: ok');
}
