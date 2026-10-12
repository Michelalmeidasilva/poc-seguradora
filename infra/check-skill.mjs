import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const read = (root, path) => readFileSync(join(root, path), 'utf8');
const directories = (root, path) =>
  existsSync(join(root, path))
    ? readdirSync(join(root, path), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => `${path}/${entry.name}`)
    : [];

// These phrases are a small, explicit safety contract; fixtures remove each rule individually.
export const MANDATORY_RULES = [
  [
    'explicit flags',
    /nunca passe[^\n]*--yes[^\n]*--confirm-project[^\n]*autorização explícita[^\n]*pedido atual/i,
  ],
  ['destroy initiative', /nunca execute[^\n]*destroy[^\n]*iniciativa própria/i],
  ['show plan', /sempre mostre[^\n]*saída do plano[^\n]*usuário[^\n]*antes de pedir confirmação/i],
  ['secrets', /nunca imprima nem armazene segredos[^\n]*conteúdo de[^\n]*infra\/\.env/i],
  [
    'nonzero exit',
    /pare e reporte[^\n]*saída diferente de zero[^\n]*significado do código de saída/i,
  ],
  ['fake image', /se faltar Dockerfile[^\n]*svc-\*[^\n]*diga ao usuário[^\n]*imagem FAKE/i],
  ['service ownership', /não edite[^\n]*apps\/svc-\*/i],
  [
    'stdin confirmations',
    /nunca forneça[^\n]*sim[^\n]*id do projeto[^\n]*entrada padrão[^\n]*(?=[^\n]*pipe)(?=[^\n]*`yes`)(?=[^\n]*heredoc)(?=[^\n]*here-string)(?=[^\n]*`expect`)/i,
  ],
  [
    'user runs without --yes',
    /sem[^\n]*--yes[^\n]*autorizado[^\n]*mostre[^\n]*resumo[^\n]*peça que ele execute[^\n]*próprio terminal/i,
  ],
  [
    'apply --yes re-plans',
    /--yes[^\n]*infra apply[^\n]*plano novo[^\n]*compare[^\n]*Resumo:[^\n]*plano mostrado antes[^\n]*pare se for diferente/i,
  ],
  [
    'destroy by the user',
    /agente nunca executa[^\n]*destroy[^\n]*usuário[^\n]*digita o id do projeto[^\n]*próprio terminal/i,
  ],
];

function frontmatter(text, name, errors) {
  const meta = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
  const field = (key) =>
    meta
      ?.match(new RegExp(`^${key}:\\s*(.*?)\\s*$`, 'm'))?.[1]
      .replace(/^['"]|['"]$/g, '')
      .trim();
  if (field('name') !== name || !field('description'))
    errors.push(`${name}: frontmatter requires matching name and non-empty description`);
}

export function parseHelp(text) {
  const surface = { service: new Set(), cmd: new Set(), flag: new Set() };
  for (const line of text.split(/\r?\n/)) {
    // Names can contain spaces (infra plan/apply); the first double space ends the name.
    const match = line.match(/^(service|cmd|flag) (.+?) {2,}/);
    if (match) surface[match[1]].add(match[2]);
  }
  return surface;
}

function checkDeploy(root, text, errors) {
  const help = spawnSync('bash', ['infra/deploy.sh', 'help'], { cwd: root, encoding: 'utf8' });
  if (help.status !== 0) {
    errors.push(
      `deploy-service: deploy.sh help failed (exit ${help.status ?? 'unavailable'}): ${help.error?.message ?? help.stderr.trim()}`,
    );
    return;
  }
  const surface = parseHelp(help.stdout);
  for (const [type, names] of Object.entries(surface))
    if (!names.size) errors.push(`deploy-service: help has no ${type} listing`);
  const documented = { service: new Set(), cmd: new Set(), flag: new Set() };
  for (const match of text.matchAll(/--[a-z][a-z0-9-]*/g)) documented.flag.add(match[0]);
  const invocations = [
    ...text.matchAll(/(?:bash\s+infra\/deploy\.sh|pnpm\s+run\s+infra:deploy)\s+([^`\n|]+)/g),
  ];
  if (!invocations.length || invocations[0][1].trim() !== 'check')
    errors.push('deploy-service: first CLI instruction must be check');
  for (const match of invocations) {
    const tokens = match[1].trim().split(/\s+/);
    const command =
      tokens.shift() === 'infra'
        ? `infra ${tokens.shift() ?? ''}`
        : match[1].trim().split(/\s+/)[0];
    if (/^<.*>$/.test(command)) continue;
    documented.cmd.add(command);
    if (!surface.cmd.has(command)) errors.push(`deploy-service: unknown command ${command}`);
    if (['build', 'deploy', 'rollback', 'status'].includes(command)) {
      for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].startsWith('--')) {
          if (
            ['--tag', '--existing-tag', '--url', '--confirm-project', '--env-file'].includes(
              tokens[i],
            )
          )
            i++;
          continue;
        }
        if (tokens[i] === 'all' || /^<.*>$/.test(tokens[i])) continue;
        documented.service.add(tokens[i]);
        if (!surface.service.has(tokens[i]))
          errors.push(`deploy-service: unknown service ${tokens[i]}`);
      }
    }
  }
  // Also catch invented svc-* names in prose rather than only command examples.
  for (const match of text.matchAll(/\bsvc-[a-z][a-z0-9-]*/g)) {
    if (!surface.service.has(match[0])) errors.push(`deploy-service: unknown service ${match[0]}`);
  }
  for (const [type, names] of Object.entries(surface)) {
    for (const name of names)
      if (!documented[type].has(name))
        errors.push(`deploy-service: ${type === 'cmd' ? 'command' : type} ${name} not documented`);
  }
  for (const flag of documented.flag)
    if (!surface.flag.has(flag)) errors.push(`deploy-service: unknown flag ${flag}`);
  for (const [name, pattern] of MANDATORY_RULES)
    if (!pattern.test(text)) errors.push(`deploy-service: mandatory rule missing: ${name}`);
}

function checkScripts(root, text, workspaces, errors) {
  const packages = new Map(
    workspaces.map((path) => {
      const file = `${path}/package.json`;
      return [path, existsSync(join(root, file)) ? JSON.parse(read(root, file)) : {}];
    }),
  );
  const rootPackage = JSON.parse(read(root, 'package.json'));
  const fences = /```[^\n]*\n([\s\S]*?)```/g;
  const inline = text.replace(fences, '');
  const code = [...inline.matchAll(/`([^`]+)`/g), ...text.matchAll(fences)]
    .map((match) => match[1])
    .join('\n');
  for (const match of code.matchAll(/\bpnpm\s+([^`\n|;]+)/g)) {
    const tokens = match[1].trim().split(/\s+/);
    let target = rootPackage;
    let label = 'root';
    if (tokens[0] === '--filter') {
      tokens.shift();
      label = tokens.shift()?.replace(/^['"]|['"]$/g, '');
      target = packages.get(label) ?? [...packages.values()].find((pkg) => pkg.name === label);
      if (!target) {
        errors.push(`monorepo-services: unknown workspace ${label}`);
        continue;
      }
    }
    if (tokens[0] === 'run') tokens.shift();
    const script = tokens[0];
    if (!target.scripts?.[script])
      errors.push(`monorepo-services: missing script ${script} in ${label}`);
  }
}

function checkTour(root, text, errors) {
  const workspaces = [...directories(root, 'apps'), ...directories(root, 'packages')];
  const sections = new Map();
  const headings = [...text.matchAll(/^##\s+`?((?:apps|packages)\/[^`\s]+|infra\/?)`?\s*$/gm)];
  for (let i = 0; i < headings.length; i++)
    sections.set(
      headings[i][1].replace(/\/$/, ''),
      text.slice(headings[i].index, headings[i + 1]?.index ?? text.length),
    );
  for (const path of [...workspaces, 'infra'])
    if (!sections.has(path)) errors.push(`monorepo-services: missing section ${path}`);
  checkScripts(root, text, workspaces, errors);
  for (const app of ['gateway', 'chatbot']) {
    const section = sections.get(`apps/${app}`) ?? '';
    const configPath = `apps/${app}/src/config.ts`;
    if (!section) continue;
    if (!existsSync(join(root, configPath))) {
      errors.push(`monorepo-services: ${configPath} does not exist`);
      continue;
    }
    const env = new Set(
      [...read(root, configPath).matchAll(/^\s*([A-Z][A-Z0-9_]+):/gm)].map((m) => m[1]),
    );
    const named = [...section.matchAll(/\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b|`(PORT|HOST)`/g)].map(
      (m) => m[1] ?? m[0],
    );
    for (const name of new Set(named))
      if (!env.has(name)) errors.push(`monorepo-services: unknown env ${name} in ${app}`);
  }
  // Repo-prefixed paths are checked in prose, code spans and Markdown links alike.
  const paths = new Set(
    [
      ...text.matchAll(
        /(?:\b(?:apps|packages|infra|docs|scripts)\/|\.agents\/)[^\s`)\][;,]+|\b(?:WORKBOARD|AGENTS)\.md/g,
      ),
    ].map((m) => m[0].replace(/[.:]$/, '')),
  );
  for (const match of text.matchAll(/`([^`\s]+\.(?:md|json|mjs|ts|yml|yaml|env))`/g)) {
    if (!match[1].includes('://')) paths.add(match[1]);
  }
  for (const path of paths) {
    if (/[*<>{}]/.test(path)) continue; // Wildcards/placeholders describe future files, not assertions.
    if (path === 'infra/.env' && existsSync(join(root, 'infra/.env.example'))) continue;
    if (!existsSync(join(root, path)))
      errors.push(`monorepo-services: path ${path} does not exist`);
  }
  if (/^\|[^\n]*\|\s*`?(?:in_progress|not_started|done)`?\s*\|/m.test(text))
    errors.push('monorepo-services: copied status table; point to WORKBOARD.md');
}

export function checkSkills(root) {
  const errors = [];
  for (const [name, check] of [
    ['deploy-service', checkDeploy],
    ['monorepo-services', checkTour],
  ]) {
    const path = `.agents/skills/${name}/SKILL.md`;
    if (!existsSync(join(root, path))) {
      errors.push(`${path} not found`);
      continue;
    }
    const text = read(root, path);
    frontmatter(text, name, errors);
    try {
      check(root, text, errors);
    } catch (error) {
      errors.push(`${name}: ${error.message}`);
    }
  }
  return errors;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = checkSkills(resolve(process.argv[2] ?? '.'));
  if (errors.length) {
    console.error(errors.map((e) => `check-skill: ${e}`).join('\n'));
    process.exit(1);
  }
  console.log('check-skill: ok');
}
