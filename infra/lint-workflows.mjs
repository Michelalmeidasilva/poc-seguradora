// Extra checks on GitHub Actions workflows that actionlint does not enforce (run by
// infra/lint-workflows.sh, which also runs actionlint through Docker):
//   1. no untrusted expression (`${{ inputs.* }}`, `${{ github.event.* }}`, `${{ github.ref_name }}`,
//      `${{ github.head_ref }}`) inside a `run:` script: pass them through `env:` instead
//      (script injection);
//   2. every `uses:` pinned to a major tag (`@v4`, `@v4.1.0`) or a full commit SHA, never a branch;
//   3. top-level `permissions:` in every workflow;
//   4. optional presence checks: --require <file,...> and --require-jobs <file>=<job,...>.
// Line-based on purpose: the `yaml` package is not a dependency of this repo. A `run:` key at
// column c owns every following line that is blank or indented deeper than c, which covers
// block scalars (`|`, `>`), multi-line plain/quoted scalars and `- run:` list items.
// Usage: node infra/lint-workflows.mjs [--require a.yml,b.yml] [--require-jobs a.yml=j1,j2] <dir>
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const UNTRUSTED_IN_RUN =
  /\$\{\{\s*(inputs\.|github\.event\.|github\.ref_name\b|github\.head_ref\b)/;
const PINNED = /@(v\d+(\.\d+){0,2}|[0-9a-f]{40})$/;

const indentOf = (line) => line.length - line.trimStart().length;

function checkWorkflow(name, text) {
  const errors = [];
  const lines = text.split('\n');

  if (!lines.some((l) => /^permissions:/.test(l))) {
    errors.push(`${name}: no top-level permissions:`);
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*#/.test(line)) continue;

    const uses = /^(\s*)(?:-\s+)?uses:\s*['"]?([^'"\s#]+)/.exec(line);
    if (uses) {
      const ref = uses[2];
      const local = ref.startsWith('./') || ref.startsWith('docker://');
      if (!local && !PINNED.test(ref)) {
        errors.push(`${name}:${i + 1}: uses "${ref}" is not pinned to a major tag or a commit SHA`);
      }
    }

    const run = /^(\s*(?:-\s+)?)run:(.*)$/.exec(line);
    if (!run) continue;
    const value = run[2].trim();
    // `run:` with nothing after it is a mapping (e.g. `defaults: run: shell: bash`), not a script.
    if (value === '') continue;
    const column = run[1].length;
    const script = [[i, value]];
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j];
      if (next.trim() !== '' && indentOf(next) <= column) break;
      script.push([j, next]);
    }
    for (const [n, content] of script) {
      if (UNTRUSTED_IN_RUN.test(content)) {
        errors.push(
          `${name}:${n + 1}: untrusted expression inside run: (pass it through env:): ${content.trim()}`,
        );
      }
    }
  }
  return errors;
}

function jobsOf(text) {
  const jobs = [];
  let inJobs = false;
  for (const line of text.split('\n')) {
    if (/^\S/.test(line) && !line.startsWith('#')) inJobs = /^jobs:\s*$/.test(line);
    const job = inJobs && /^ {2}([A-Za-z0-9_-]+):/.exec(line);
    if (job) jobs.push(job[1]);
  }
  return jobs;
}

function main(argv) {
  const required = [];
  const requiredJobs = [];
  let dir;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--require') required.push(...argv[++i].split(','));
    else if (argv[i] === '--require-jobs') {
      const [file, jobs] = argv[++i].split('=');
      requiredJobs.push([file, jobs.split(',')]);
    } else dir = argv[i];
  }
  if (!dir || !existsSync(dir)) {
    console.error(
      `usage: lint-workflows.mjs [--require ...] [--require-jobs ...] <dir> (got ${dir})`,
    );
    return 2;
  }

  const files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));
  const errors = [];
  if (files.length === 0) errors.push(`${dir}: no workflow files`);
  for (const f of required) {
    if (!files.includes(f)) errors.push(`${f}: required workflow is missing`);
  }
  for (const f of files) {
    const text = readFileSync(join(dir, f), 'utf8');
    errors.push(...checkWorkflow(f, text));
  }
  for (const [f, jobs] of requiredJobs) {
    if (!files.includes(f)) continue;
    const present = jobsOf(readFileSync(join(dir, f), 'utf8'));
    for (const job of jobs) {
      if (!present.includes(job)) errors.push(`${f}: required job "${job}" is missing`);
    }
  }

  for (const e of errors) console.log(`FAIL ${e}`);
  if (errors.length === 0) console.log(`ok   workflow checks (${files.join(', ')})`);
  return errors.length === 0 ? 0 : 1;
}

process.exitCode = main(process.argv.slice(2));
