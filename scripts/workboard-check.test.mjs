import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { parseWorkboard, validateRows, overlaps, checkRepo } from './workboard-check.mjs';

const HEADER =
  '| Workstream | Caminho | Status | Dono | Branch | Iniciado | Atualizado | Notas |\n' +
  '|---|---|---|---|---|---|---|---|\n';

const row = (o = {}) => {
  const r = {
    workstream: 'protocol',
    path: 'packages/protocol',
    status: 'not_started',
    owner: '-',
    branch: '-',
    started: '-',
    updated: '-',
    notes: '',
    ...o,
  };
  return `| ${r.workstream} | ${r.path} | ${r.status} | ${r.owner} | ${r.branch} | ${r.started} | ${r.updated} | ${r.notes} |`;
};

const board = (...rows) => HEADER + rows.join('\n') + '\n';

test('parseWorkboard reads a valid row', () => {
  const { rows, errors } = parseWorkboard(board(row()));
  assert.deepEqual(errors, []);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].workstream, 'protocol');
  assert.deepEqual(rows[0].paths, ['packages/protocol']);
  assert.equal(rows[0].status, 'not_started');
  assert.equal(rows[0].notes, '');
});

test('parseWorkboard accepts CRLF line endings', () => {
  const text = board(row()).replace(/\n/g, '\r\n');
  const { rows, errors } = parseWorkboard(text);
  assert.deepEqual(errors, []);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'not_started');
});

test('parseWorkboard splits comma separated paths and strips backticks', () => {
  const { rows } = parseWorkboard(board(row({ path: '`apps/web/src/chat`, `apps/web/src/transport`' })));
  assert.deepEqual(rows[0].paths, ['apps/web/src/chat', 'apps/web/src/transport']);
});

test('parseWorkboard reports a wrong column count', () => {
  const { errors } = parseWorkboard(HEADER + '| only | three | cols |\n');
  assert.equal(errors.length, 1);
  assert.match(errors[0], /expected 8 columns/);
});

test('parseWorkboard reports a missing header', () => {
  const { errors } = parseWorkboard('# nothing here\n');
  assert.match(errors[0], /header row not found/);
});

test('parseWorkboard reports a wrong header', () => {
  const bad = board(row()).replace('Dono', 'Owner');
  const { errors } = parseWorkboard(bad);
  assert.match(errors[0], /header must be/);
});

const parse = (...rows) => parseWorkboard(board(...rows)).rows;

test('validateRows accepts a consistent board', () => {
  const rows = parse(
    row(),
    row({
      workstream: 'resilience',
      path: 'packages/resilience',
      status: 'in_progress',
      owner: 'claude',
      branch: 'feat/resilience',
      started: '2026-10-10',
      updated: '2026-10-10',
    }),
  );
  assert.deepEqual(validateRows(rows), []);
});

test('validateRows rejects an invalid status and an invalid owner', () => {
  const errors = validateRows(parse(row({ status: 'doing', owner: 'bob' })));
  assert.ok(errors.some((e) => /invalid status "doing"/.test(e)));
  assert.ok(errors.some((e) => /invalid owner "bob"/.test(e)));
});

test('validateRows accepts a human owner', () => {
  const rows = parse(
    row({ status: 'in_progress', owner: 'human:maria', branch: 'b', started: '2026-10-10' }),
  );
  assert.deepEqual(validateRows(rows), []);
});

test('validateRows requires owner, branch and start date for in_progress and blocked', () => {
  for (const status of ['in_progress', 'blocked']) {
    const errors = validateRows(parse(row({ status })));
    assert.ok(errors.some((e) => /requires an owner/.test(e)), status);
    assert.ok(errors.some((e) => /requires a branch/.test(e)), status);
    assert.ok(errors.some((e) => /requires a start date/.test(e)), status);
  }
});

test('validateRows rejects an owner on a not_started row', () => {
  const errors = validateRows(parse(row({ owner: 'claude' })));
  assert.ok(errors.some((e) => /not_started must not have an owner/.test(e)));
});

test('validateRows rejects duplicate workstreams', () => {
  const errors = validateRows(parse(row(), row({ path: 'packages/other' })));
  assert.ok(errors.some((e) => /duplicate workstream/.test(e)));
});

test('overlaps works on path segments', () => {
  assert.equal(overlaps('apps/web', 'apps/web/src/chat'), true);
  assert.equal(overlaps('apps/web/src/chat', 'apps/web/src/flows'), false);
  assert.equal(overlaps('apps/web2', 'apps/web'), false);
  assert.equal(overlaps('apps/web/', 'apps/web'), true);
});

test('validateRows rejects overlapping paths of rows that are not done', () => {
  const errors = validateRows(
    parse(
      row({ workstream: 'web', path: 'apps/web' }),
      row({ workstream: 'web-chat', path: 'apps/web/src/chat' }),
    ),
  );
  assert.ok(errors.some((e) => /overlap/.test(e)));
});

test('validateRows ignores overlap when one of the rows is done', () => {
  const errors = validateRows(
    parse(
      row({ workstream: 'web', path: 'apps/web', status: 'done', owner: 'claude' }),
      row({ workstream: 'web-chat', path: 'apps/web/src/chat' }),
    ),
  );
  assert.deepEqual(errors, []);
});

test('validateRows reports paths that do not exist', () => {
  const errors = validateRows(parse(row()), () => false);
  assert.ok(errors.some((e) => /does not exist/.test(e)));
});

const makeRepo = (root, { workboard } = {}) => {
  const write = (rel, content) => {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), content);
  };
  mkdirSync(join(root, 'packages/protocol'), { recursive: true });
  write('WORKBOARD.md', workboard ?? board(row()));
  write('AGENTS.md', '# rules\n');
  for (const p of [
    'CLAUDE.md',
    'GEMINI.md',
    '.cursor/rules/workboard.mdc',
    '.github/copilot-instructions.md',
  ]) {
    write(p, 'See AGENTS.md\n');
  }
  write('.agents/skills/workboard-protocol/SKILL.md', '---\nname: workboard-protocol\n---\n');
  for (const l of ['.claude/skills/workboard-protocol', '.agent/skills/workboard-protocol']) {
    mkdirSync(dirname(join(root, l)), { recursive: true });
    symlinkSync('../../.agents/skills/workboard-protocol', join(root, l));
  }
};

test('checkRepo passes on a complete repository', () => {
  const root = mkdtempSync(join(tmpdir(), 'wb-ok-'));
  makeRepo(root);
  assert.deepEqual(checkRepo(root), []);
});

test('checkRepo reports a missing WORKBOARD.md', () => {
  const root = mkdtempSync(join(tmpdir(), 'wb-empty-'));
  assert.deepEqual(checkRepo(root), ['WORKBOARD.md not found']);
});

test('checkRepo reports a pointer that does not mention AGENTS.md', () => {
  const root = mkdtempSync(join(tmpdir(), 'wb-ptr-'));
  makeRepo(root);
  writeFileSync(join(root, 'CLAUDE.md'), 'nothing useful\n');
  assert.ok(checkRepo(root).some((e) => /CLAUDE\.md must mention AGENTS\.md/.test(e)));
});

test('checkRepo reports a skill symlink that is missing', () => {
  const root = mkdtempSync(join(tmpdir(), 'wb-skill-missing-'));
  makeRepo(root);
  rmSync(join(root, '.agent/skills/workboard-protocol'), { recursive: true });
  assert.ok(checkRepo(root).some((e) => /\.agent\/skills\/workboard-protocol missing/.test(e)));
});

test('checkRepo reports a skill symlink that points to the wrong place', () => {
  const root = mkdtempSync(join(tmpdir(), 'wb-skill-wrong-'));
  makeRepo(root);
  mkdirSync(join(root, 'elsewhere'), { recursive: true });
  rmSync(join(root, '.claude/skills/workboard-protocol'), { recursive: true });
  symlinkSync('../../elsewhere', join(root, '.claude/skills/workboard-protocol'));
  assert.ok(
    checkRepo(root).some((e) => /\.claude\/skills\/workboard-protocol must resolve/.test(e)),
  );
});
