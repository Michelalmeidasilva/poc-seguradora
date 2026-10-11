// Consistency check of the deploy runbook (docs/deploy.md) against the repository. No
// dependencies, no shell: it only reads files. Checks:
//   (a) every repository path the runbook names (`infra/...`, `docs/...`, `apps/...`,
//       `.github/workflows/...`, and relative Markdown links) exists;
//   (b) every Terraform variable it names (`var.<name>`, `-var <name>=`, `-var="<name>=`,
//       `TF_VAR_<name>` in any case, top-level keys of ```hcl blocks) is declared in
//       infra/terraform/variables.tf;
//   (c) every `vars.<NAME>` of .github/workflows/deploy.yml appears in the runbook and in its
//       repository variable table (the first table after a heading "Variáveis do repositório"),
//       and every name in that table is used by deploy.yml;
//   (d) every address in `-target=`, `-replace=` or `terraform taint` is declared in
//       infra/terraform/*.tf;
//   (e) the required sections exist (headings).
// Usage: node infra/check-runbook.mjs [--root <repo root>]
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RUNBOOK = 'docs/deploy.md';
const VARIABLES_TF = 'infra/terraform/variables.tf';
const TERRAFORM_DIR = 'infra/terraform';
const DEPLOY_WORKFLOW = '.github/workflows/deploy.yml';

export const REQUIRED_SECTIONS = [
  ['sumário', /sum[aá]rio/i],
  ['checklist rápido', /checklist r[aá]pido/i],
  ['bootstrap', /bootstrap/i],
  ['primeiro apply', /primeiro apply/i],
  ['github', /github/i],
  ['smoke', /smoke/i],
  ['TRUST_PROXY_HOPS', /TRUST_PROXY_HOPS/],
  ['rollback', /rollback/i],
  ['custos', /custos?\b/i],
  ['destruição', /destrui[cç][aã]o/i],
  ['pendências', /pend[eê]ncias/i],
];

const REPO_PATH =
  /(?<![A-Za-z0-9_.:/~<>-])((?:infra|docs|apps|\.github\/workflows)\/[A-Za-z0-9._/-]*)/g;
const MARKDOWN_LINK = /\]\((?!https?:|mailto:|#)([^)\s#]+)/g;
const TF_VAR_REFS = [
  /\bvar\.([A-Za-z_][A-Za-z0-9_]*)/g,
  /-var(?:\s+|=)["']?([A-Za-z_][A-Za-z0-9_]*)=/g,
  /\bTF_VAR_([A-Za-z0-9_]+)/g,
];
const ADDRESS_REFS = [/-(?:target|replace)=(\S+)/g, /\bterraform\s+taint\s+(\S+)/g];

/** Splits Markdown into fenced code blocks and the lines outside them. */
function parseMarkdown(text) {
  const blocks = [];
  const prose = [];
  let open = null;
  for (const line of text.split('\n')) {
    const fence = /^\s*(`{3,}|~{3,})\s*([\w-]*)/.exec(line);
    if (open) {
      if (fence && fence[1][0] === open.marker[0] && fence[1].length >= open.marker.length) {
        blocks.push(open);
        open = null;
      } else open.lines.push(line);
    } else if (fence) open = { marker: fence[1], lang: fence[2].toLowerCase(), lines: [] };
    else prose.push(line);
  }
  if (open) blocks.push(open);
  return { blocks, prose };
}

/** Top-level keys of an HCL/tfvars snippet, commented-out ones included (`# key = value`). */
function hclKeys(lines) {
  const keys = [];
  let depth = 0;
  for (const line of lines) {
    const key = /^\s*(?:#\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (key && depth === 0) keys.push(key[1]);
    const code = line.replace(/#.*$/, '').replace(/"(?:[^"\\]|\\.)*"/g, '""');
    depth += (code.match(/[{[]/g) ?? []).length - (code.match(/[}\]]/g) ?? []).length;
    if (depth < 0) depth = 0;
  }
  return keys;
}

const matchesOf = (text, regex) => [...text.matchAll(regex)].map((m) => m[1]);

function readOrNull(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

function declaredAddresses(root) {
  const dir = join(root, TERRAFORM_DIR);
  const addresses = new Set();
  if (!existsSync(dir)) return addresses;
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.tf'))) {
    const text = readFileSync(join(dir, file), 'utf8');
    for (const m of text.matchAll(/^\s*(resource|data)\s+"([^"]+)"\s+"([^"]+)"/gm)) {
      addresses.add(m[1] === 'data' ? `data.${m[2]}.${m[3]}` : `${m[2]}.${m[3]}`);
    }
  }
  return addresses;
}

/** Repository variable names listed in the first table after "Variáveis do repositório". */
function variableTable(prose) {
  const start = prose.findIndex((l) => /^#{1,6}\s.*vari[aá]veis do reposit[oó]rio/i.test(l));
  if (start < 0) return null;
  const names = [];
  let inTable = false;
  for (const line of prose.slice(start + 1)) {
    if (/^#{1,6}\s/.test(line)) break;
    if (line.trimStart().startsWith('|')) {
      inTable = true;
      const name = /^\s*\|\s*`([A-Z][A-Z0-9_]*)`/.exec(line);
      if (name) names.push(name[1]);
    } else if (inTable) break;
  }
  return names.length ? names : null;
}

export function analyzeRunbook(root) {
  const errors = [];
  const counts = { paths: 0, variables: 0, repoVariables: 0, addresses: 0 };
  const text = readOrNull(join(root, RUNBOOK));
  if (text === null) return { errors: [`${RUNBOOK} not found`], counts };
  const { blocks, prose } = parseMarkdown(text);

  // (a) repository paths.
  const paths = new Set(matchesOf(text, REPO_PATH).map((p) => p.replace(/[.,:;]+$/, '')));
  for (const link of matchesOf(prose.join('\n'), MARKDOWN_LINK)) {
    const target = resolve(dirname(join(root, RUNBOOK)), link);
    paths.add(target.startsWith(resolve(root)) ? target.slice(resolve(root).length + 1) : link);
  }
  for (const path of paths) {
    counts.paths++;
    if (!existsSync(join(root, path))) errors.push(`path "${path}" does not exist in the repo`);
  }

  // (b) Terraform variables.
  const variablesTf = readOrNull(join(root, VARIABLES_TF)) ?? '';
  const declaredVars = new Set(matchesOf(variablesTf, /^\s*variable\s+"([^"]+)"/gm));
  const usedVars = new Map();
  for (const regex of TF_VAR_REFS) {
    for (const m of text.matchAll(regex)) {
      const name = regex.source.includes('TF_VAR_') ? m[1].toLowerCase() : m[1];
      if (!usedVars.has(name)) usedVars.set(name, m[0]);
    }
  }
  for (const block of blocks.filter((b) => ['hcl', 'tfvars', 'terraform'].includes(b.lang))) {
    for (const key of hclKeys(block.lines)) {
      if (!usedVars.has(key)) usedVars.set(key, `${key} = ... (hcl block)`);
    }
  }
  for (const [name, where] of usedVars) {
    counts.variables++;
    if (!declaredVars.has(name)) {
      errors.push(`unknown Terraform variable "${name}" (${where}) not in ${VARIABLES_TF}`);
    }
  }

  // (c) GitHub repository variables.
  const workflow = readOrNull(join(root, DEPLOY_WORKFLOW)) ?? '';
  const workflowVars = new Set(matchesOf(workflow, /\bvars\.([A-Za-z0-9_]+)/g));
  for (const name of workflowVars) {
    counts.repoVariables++;
    if (!new RegExp(`\\b${name}\\b`).test(text)) {
      errors.push(`repository variable ${name} (vars.${name} in ${DEPLOY_WORKFLOW}) is missing`);
    }
  }
  const table = variableTable(prose);
  if (!table) {
    errors.push('no repository variable table (a heading "Variáveis do repositório" + a table)');
  } else {
    for (const name of table) {
      if (!workflowVars.has(name)) {
        errors.push(`variable table lists "${name}", not used by ${DEPLOY_WORKFLOW}`);
      }
    }
    for (const name of workflowVars) {
      if (!table.includes(name)) errors.push(`variable table does not list ${name}`);
    }
  }

  // (d) resource addresses.
  const declared = declaredAddresses(root);
  for (const regex of ADDRESS_REFS) {
    for (const raw of matchesOf(text, regex)) {
      const address = raw.replace(/^["']|["'`]$/g, '').replace(/\[[^\]]*\]$/, '');
      if (address.includes('<')) continue;
      counts.addresses++;
      if (!declared.has(address)) {
        errors.push(`resource address "${address}" is not declared in ${TERRAFORM_DIR}/*.tf`);
      }
    }
  }

  // (e) required sections.
  const headings = prose.filter((l) => /^#{1,6}\s/.test(l));
  for (const [name, regex] of REQUIRED_SECTIONS) {
    if (!headings.some((h) => regex.test(h))) {
      errors.push(`missing section "${name}" (no heading matching ${regex})`);
    }
  }

  return { errors, counts };
}

export const checkRunbook = (root) => analyzeRunbook(root).errors;

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const rootFlag = args.indexOf('--root');
  const root =
    rootFlag >= 0
      ? resolve(args[rootFlag + 1] ?? '.')
      : resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const { errors, counts } = analyzeRunbook(root);
  if (errors.length) {
    for (const e of errors) console.error(`check-runbook: ${e}`);
    process.exit(1);
  }
  console.log(
    `ok ${RUNBOOK}: ${counts.paths} paths, ${counts.variables} Terraform variables, ` +
      `${counts.repoVariables} repository variables, ${counts.addresses} resource addresses`,
  );
}
