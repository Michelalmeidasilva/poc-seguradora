import { readFileSync, writeFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { fileURLToPath, URL } from 'node:url';

const catalogUrl = new URL(
  '../../../../docs/prototypes/whatsapp-experience/catalog.js',
  import.meta.url,
);
const source = readFileSync(catalogUrl, 'utf8');
const sandbox = { window: {} };
runInNewContext(source, sandbox, { timeout: 1_000 });
const canonical = sandbox.window.EXPERIENCE;
if (!canonical || canonical.total !== 247)
  throw new Error('unexpected canonical catalog structure');

const groups = canonical.groups
  .filter((group) => group.code !== 'LEG')
  .map((group) => ({
    id: group.code,
    title: group.title,
    steps: group.steps
      .filter((step) => !step.id.startsWith('LEG-'))
      .map((step) => {
        const converted = { ...step, journeyId: step.journey };
        delete converted.journey;
        delete converted.position;
        if (converted.id.startsWith('IDE-')) {
          const ide = {
            'IDE-01': [
              'Para continuar, informe seu CPF.',
              'Informe o CPF',
              'chat',
            ],
            'IDE-02': ['Informe seu CPF.', 'Validando formato', 'chat'],
            'IDE-03': ['Confira seus contratos.', 'Formato aceito', 'chat'],
            'IDE-04': [
              'O CPF precisa ter 11 dígitos. Tente novamente.',
              'Formato inválido',
              'chat',
            ],
            'IDE-05': [
              'Sua sessão expirou. Informe seu CPF para continuar.',
              'Sessão expirada',
              'chat',
            ],
            'IDE-06': [
              'Informe seu CPF para retomar a revisão do seu pedido.',
              'Renovar acesso',
              'chat',
            ],
            'IDE-07': [
              'Não encontrei essa informação. Posso ajudar você a continuar.',
              'Dado indisponível',
              'chat',
            ],
            'IDE-08': [
              'Para continuar, informe seu CPF.',
              'Informar CPF',
              'chat',
            ],
          }[converted.id];
          converted.title = ide[1];
          converted.bot = ide[0];
          converted.mode = ide[2];
          converted.user = '';
          converted.requiresAuth = false;
          converted.actions = converted.actions
            .filter((action) => action.label !== 'Informar CPF')
            .map((action) => ({
              ...action,
              target:
                action.target === 'IDE-02' || action.target === 'IDE-01' ? 'IDE-08' : action.target,
            }));
          // CPF receipt and approval are internal states; successful identification resumes the destination directly.
          if (converted.id === 'IDE-02') converted.actions = [];
          delete converted.flow;
        }
        return converted;
      }),
  }));

const output = JSON.stringify({ version: canonical.version, groups }, null, 2) + '\n';
writeFileSync(
  fileURLToPath(new URL('./assistance-catalog.generated.json', import.meta.url)),
  output,
);

// The offline atlas uses the same field parser as the running chatbot.
const parserSource = readFileSync(new URL('./dependent-statement.ts', import.meta.url), 'utf8');
const parserJs = ts.transpileModule(parserSource, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
  },
}).outputText.replace(/^"use strict";\n/, '');
writeFileSync(
  new URL(
    '../../../../docs/prototypes/whatsapp-experience/dependent-parser.generated.js',
    import.meta.url,
  ),
  `/* global window */\n// Generated from apps/chatbot/src/domain/dependent-statement.ts.\n(() => { const exports = {};\n${parserJs}\nwindow.DEPENDENT_PARSER = exports.parseDependentStatement;\n})();\n`,
);
