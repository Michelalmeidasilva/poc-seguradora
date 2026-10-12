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
  const { rows } = parseWorkboard(
    board(row({ path: '`apps/web/src/chat`, `apps/web/src/transport`' })),
  );
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
    row({
      status: 'in_progress',
      owner: 'human:maria',
      branch: 'b',
      started: '2026-10-10',
      updated: '2026-10-10',
    }),
  );
  assert.deepEqual(validateRows(rows), []);
});

test('validateRows requires owner, branch and start date for in_progress and blocked', () => {
  for (const status of ['in_progress', 'blocked']) {
    const errors = validateRows(parse(row({ status })));
    assert.ok(
      errors.some((e) => /requires an owner/.test(e)),
      status,
    );
    assert.ok(
      errors.some((e) => /requires a branch/.test(e)),
      status,
    );
    assert.ok(
      errors.some((e) => /Iniciado.*real date/.test(e)),
      status,
    );
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
      row({
        workstream: 'web',
        path: 'apps/web',
        status: 'done',
        owner: 'claude',
        started: '2026-10-10',
        updated: '2026-10-10',
      }),
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
  write(
    '.agents/skills/workboard-protocol/SKILL.md',
    '---\nname: workboard-protocol\ndescription: Repository ownership protocol.\n---\n',
  );
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

// ---- fix wave: stricter validation ----
const HDR_ONLY = HEADER.split('\n')[0] + '\n';
const active = (o = {}) =>
  row({
    status: 'in_progress',
    owner: 'claude',
    branch: 'b',
    started: '2026-10-10',
    updated: '2026-10-10',
    ...o,
  });

test('paths are normalized before the overlap check', () => {
  for (const other of ['./packages/protocol', 'apps/../packages/protocol', 'packages/protocol/']) {
    const errors = validateRows(
      parse(
        row({ workstream: 'a', path: 'packages/protocol' }),
        row({ workstream: 'b', path: other }),
      ),
    );
    assert.ok(
      errors.some((e) => /overlap/.test(e)),
      other,
    );
  }
});

test('validateRows rejects ".", absolute, parent-escaping and empty paths', () => {
  for (const path of ['.', '/etc', '../x', 'a/../../x', '']) {
    const errors = validateRows(parse(row({ workstream: 'ws-bad', path })));
    assert.ok(
      errors.some((e) => /ws-bad/.test(e) && /path/.test(e) && !/does not exist/.test(e)),
      `"${path}": ${errors.join(';')}`,
    );
  }
});

test('parseWorkboard requires a well formed separator row and still validates the first row', () => {
  const { rows, errors } = parseWorkboard(HDR_ONLY + row() + '\n');
  assert.ok(errors.some((e) => /separator row missing or malformed/.test(e)));
  assert.equal(rows.length, 1);
});

test('parseWorkboard accepts alignment colons in the separator row', () => {
  const { errors } = parseWorkboard(
    HDR_ONLY + '|:--|---:|:-:|---|---|---|---|---|\n' + row() + '\n',
  );
  assert.deepEqual(errors, []);
});

test('parseWorkboard rejects table lines after the end of the table', () => {
  const text = HEADER + row() + '\n\n' + row({ workstream: 'hidden' }) + '\n';
  const { errors } = parseWorkboard(text);
  assert.ok(errors.some((e) => /table line after the end of the table at line 5/.test(e)));
});

test('validateRows requires an owner for done and any non not_started row', () => {
  for (const status of ['done', 'in_progress', 'blocked']) {
    const errors = validateRows(
      parse(row({ status, owner: '-', branch: 'b', started: '2026-10-10', updated: '2026-10-10' })),
    );
    assert.ok(
      errors.some((e) => /requires an owner/.test(e)),
      status,
    );
  }
});

test('validateRows rejects non-date and impossible dates', () => {
  for (const bad of ['yesterday', '2026-13-45', '2026-02-30']) {
    const errors = validateRows(parse(active({ started: bad, updated: bad })));
    assert.ok(
      errors.some((e) => /Iniciado/.test(e)),
      bad,
    );
    assert.ok(
      errors.some((e) => /Atualizado/.test(e)),
      bad,
    );
  }
});

test('validateRows requires started and updated dates for in_progress, blocked and done', () => {
  for (const status of ['in_progress', 'blocked', 'done']) {
    const errors = validateRows(parse(active({ status, updated: '-' })));
    assert.ok(
      errors.some((e) => /Atualizado/.test(e)),
      status,
    );
    const errors2 = validateRows(parse(active({ status, started: '-' })));
    assert.ok(
      errors2.some((e) => /Iniciado/.test(e)),
      status,
    );
  }
});

test('validateRows accepts a done row with owner and real dates', () => {
  assert.deepEqual(validateRows(parse(active({ status: 'done' }))), []);
});

const addSkill = (
  root,
  name = 'second-skill',
  frontmatter = `name: ${name}\ndescription: Another skill.`,
) => {
  const real = join(root, '.agents/skills', name);
  mkdirSync(real, { recursive: true });
  writeFileSync(join(real, 'SKILL.md'), `---\n${frontmatter}\n---\n# Skill\n`);
  for (const tool of ['.claude', '.agent']) {
    symlinkSync(`../../.agents/skills/${name}`, join(root, tool, 'skills', name));
  }
};

for (const kind of ['missing', 'wrong', 'copy', 'absolute', 'name', 'description', 'file']) {
  test(`checkRepo validates every skill: ${kind}`, (t) => {
    const root = mkdtempSync(join(tmpdir(), 'wb-second-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    makeRepo(root);
    addSkill(root);
    const link = join(root, '.claude/skills/second-skill');
    const real = join(root, '.agents/skills/second-skill');
    if (['missing', 'wrong', 'copy', 'absolute'].includes(kind)) rmSync(link);
    if (kind === 'wrong') symlinkSync('../../.agents/skills/workboard-protocol', link);
    if (kind === 'copy') {
      mkdirSync(link);
      writeFileSync(join(link, 'SKILL.md'), 'copy');
    }
    if (kind === 'absolute') symlinkSync(real, link);
    if (kind === 'name')
      writeFileSync(join(real, 'SKILL.md'), '---\nname: wrong\ndescription: Valid.\n---\n');
    if (kind === 'description')
      writeFileSync(join(real, 'SKILL.md'), '---\nname: second-skill\ndescription: ""\n---\n');
    if (kind === 'file') rmSync(join(real, 'SKILL.md'));
    const errors = checkRepo(root);
    assert.ok(
      errors.some((e) => e.includes('second-skill')),
      errors.join('; '),
    );
    assert.ok(
      errors.some((e) =>
        new RegExp(
          {
            missing: 'missing',
            wrong: 'must resolve',
            copy: 'relative symlink',
            absolute: 'relative symlink',
            name: 'name',
            description: 'description',
            file: 'SKILL.md.*not found',
          }[kind],
        ).test(e),
      ),
      errors.join('; '),
    );
  });
}

test('checkRepo accepts a second consistent skill', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'wb-second-ok-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  makeRepo(root);
  addSkill(root);
  assert.deepEqual(checkRepo(root), []);
});
