// Check the local deployment runbook against repository files and tool-free CLI help.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseHelp } from './check-skill.mjs';

const RUNBOOK = 'docs/deploy.md';
const VARIABLES_TF = 'infra/terraform/variables.tf';
const TERRAFORM_DIR = 'infra/terraform';
const ENV_EXAMPLE = 'infra/.env.example';

export const REQUIRED_SECTIONS = [
  ['pré-requisitos', /pr[eé]-requisitos/i],
  ['configuração', /configura[cç][aã]o/i],
  ['primeiro deploy', /primeiro deploy/i],
  ['deploy por serviço', /deploy por servi[cç]o/i],
  ['rollback', /rollback/i],
  ['smoke', /smoke/i],
  ['TRUST_PROXY_HOPS', /TRUST_PROXY_HOPS/],
  ['custos', /custos?\b/i],
  ['destruição', /destrui[cç][aã]o/i],
  ['limites', /limites/i],
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

function checkCLI(root, text, errors, counts) {
  const help = spawnSync('bash', ['infra/deploy.sh', 'help'], { cwd: root, encoding: 'utf8' });
  if (help.status !== 0) {
    errors.push(`deploy.sh help failed (exit ${help.status ?? 'unavailable'})`);
    return;
  }
  const surface = parseHelp(help.stdout);
  for (const [kind, names] of Object.entries(surface)) {
    if (!names.size) errors.push(`help has no ${kind} listing`);
  }
  const documentedCommands = new Set();
  // Only flags in local CLI invocations belong to deploy.sh; Terraform flags remain separate.
  for (const match of text.matchAll(
    /(?:bash\s+infra\/deploy\.sh|pnpm\s+run\s+infra:deploy)\s+([^`\n|]+)/g,
  )) {
    const tokens = match[1].trim().split(/\s+/);
    const first = tokens.shift();
    const command = first === 'infra' ? `infra ${tokens.shift() ?? ''}` : first;
    if (/^<.*>$/.test(command)) continue;
    documentedCommands.add(command);
    if (!surface.cmd.has(command)) errors.push(`unknown command ${command}`);
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.startsWith('#')) break;
      if (token.startsWith('--')) {
        if (!surface.flag.has(token)) errors.push(`unknown flag ${token}`);
        if (['--tag', '--existing-tag', '--url', '--confirm-project', '--env-file'].includes(token))
          i++;
      } else if (
        ['build', 'deploy', 'rollback', 'status'].includes(command) &&
        token !== 'all' &&
        !/^<.*>$/.test(token)
      ) {
        if (!surface.service.has(token)) errors.push(`unknown service ${token}`);
      }
    }
  }
  // Standalone flags in code spans are also part of the documented CLI surface.
  for (const match of text.matchAll(/`(--[a-z][a-z0-9-]*)`/g)) {
    if (!surface.flag.has(match[1])) errors.push(`unknown flag ${match[1]}`);
  }
  for (const match of text.matchAll(/\bsvc-[a-z][a-z0-9-]*/g)) {
    if (match[0] === 'svc-X') continue; // Future Dockerfile convention, not a service name.
    if (!surface.service.has(match[0])) errors.push(`unknown service ${match[0]}`);
  }
  for (const command of surface.cmd) {
    if (!documentedCommands.has(command)) errors.push(`command ${command} not documented`);
  }
  counts.commands = documentedCommands.size;
}

function checkEnv(root, prose, errors, counts) {
  const declared = new Set(
    matchesOf(readOrNull(join(root, ENV_EXAMPLE)) ?? '', /^([A-Z][A-Z0-9_]*)=/gm),
  );
  const start = prose.findIndex((line) => /^#{1,6}\s.*configura[cç][aã]o/i.test(line));
  const named = new Set();
  for (const line of prose.slice(start + 1)) {
    if (/^#{1,6}\s/.test(line)) break;
    const match = /^\s*\|\s*`([A-Z][A-Z0-9_]*)`\s*\|/.exec(line);
    if (match) named.add(match[1]);
  }
  for (const name of named)
    if (!declared.has(name)) errors.push(`unknown env key ${name} in configuration table`);
  for (const name of declared)
    if (!named.has(name)) errors.push(`env key ${name} not documented in configuration table`);
  if (!declared.size) errors.push(`${ENV_EXAMPLE} has no configuration keys`);
  counts.envKeys = named.size;
}

export function analyzeRunbook(root) {
  const errors = [];
  const counts = { paths: 0, variables: 0, envKeys: 0, commands: 0, addresses: 0 };
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
    if (path === 'infra/.env' && existsSync(join(root, ENV_EXAMPLE))) continue;
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

  // CLI and local configuration contract.
  checkCLI(root, text, errors, counts);
  checkEnv(root, prose, errors, counts);
  if (
    /deploy\.yml|\bWIF\b|environment:\s*production|\bvars\.[A-Za-z_]|vari[aá]veis[^\n]*GitHub|GitHub[^\n]*vari[aá]veis/i.test(
      text,
    )
  ) {
    errors.push('obsolete deployment reference (local operator flow required)');
  }

  // (d) resource addresses.
  const declared = declaredAddresses(root);
  for (const regex of ADDRESS_REFS) {
    for (const raw of matchesOf(text, regex)) {
      const address = raw.replace(/^["']|["'`]+$/g, '').replace(/\[[^\]]*\]$/, '');
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
      `${counts.envKeys} env keys, ${counts.commands} commands, ` +
      `${counts.addresses} resource addresses`,
  );
}
