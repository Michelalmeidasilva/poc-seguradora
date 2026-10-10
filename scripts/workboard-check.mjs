import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
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

  const rows = [];
  for (let i = headerIdx + 2; i < lines.length; i++) {
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
        .map((p) => p.trim())
        .filter(Boolean),
      status: c[2],
      owner: c[3],
      branch: c[4],
      started: c[5],
      updated: c[6],
      notes: c[7],
    });
  }
  return { rows, errors };
}

const segments = (p) => p.replace(/\/+$/, '').split('/');

export function overlaps(a, b) {
  const x = segments(a);
  const y = segments(b);
  const n = Math.min(x.length, y.length);
  return x.slice(0, n).join('/') === y.slice(0, n).join('/');
}

export function validateRows(rows, exists = () => true) {
  const errors = [];
  const seen = new Set();

  for (const r of rows) {
    const at = `line ${r.line} (${r.workstream})`;
    if (seen.has(r.workstream)) errors.push(`${at}: duplicate workstream`);
    seen.add(r.workstream);

    if (!STATUSES.includes(r.status)) errors.push(`${at}: invalid status "${r.status}"`);
    if (!OWNER_RE.test(r.owner)) errors.push(`${at}: invalid owner "${r.owner}"`);

    if (r.status === 'in_progress' || r.status === 'blocked') {
      if (r.owner === '-') errors.push(`${at}: ${r.status} requires an owner`);
      if (r.branch === '-' || r.branch === '') errors.push(`${at}: ${r.status} requires a branch`);
      if (!DATE_RE.test(r.started)) {
        errors.push(`${at}: ${r.status} requires a start date (YYYY-MM-DD)`);
      }
    }
    if (r.status === 'not_started' && r.owner !== '-') {
      errors.push(`${at}: not_started must not have an owner`);
    }
    for (const p of r.paths) {
      if (!exists(p)) errors.push(`${at}: path "${p}" does not exist`);
    }
  }

  const active = rows.filter((r) => r.status !== 'done');
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      const clash = a.paths.some((pa) => b.paths.some((pb) => overlaps(pa, pb)));
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

  const real = join(root, SKILL_REAL);
  if (!existsSync(real)) errors.push(`${SKILL_REAL} not found`);
  for (const l of SKILL_LINKS) {
    const f = join(root, l);
    if (!existsSync(f)) {
      errors.push(`${l} missing`);
    } else if (!existsSync(real) || realpathSync(f) !== realpathSync(real)) {
      errors.push(`${l} must resolve to ${SKILL_REAL}`);
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
