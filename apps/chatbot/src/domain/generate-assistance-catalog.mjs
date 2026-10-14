import { readFileSync, writeFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
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
              'Para abrir esta demonstração, digite um CPF com 11 dígitos aqui no chat, com ou sem pontuação XXX.XXX.XXX-XX. Este formato não confirma identidade.',
              'Informe o CPF',
              'chat',
            ],
            'IDE-02': [
              'Recebi o CPF para validar o formato da demonstração.',
              'Validando formato',
              'chat',
            ],
            'IDE-03': [
              'O formato do CPF foi aceito. Os dados seguintes pertencem a um cenário fictício.',
              'Formato aceito',
              'chat',
            ],
            'IDE-04': [
              'O CPF precisa ter 11 dígitos. Tente novamente ou peça ajuda.',
              'Formato inválido',
              'chat',
            ],
            'IDE-05': [
              'A sessão demonstrativa expirou. Informe novamente o CPF para continuar.',
              'Sessão expirada',
              'chat',
            ],
            'IDE-06': [
              'Digite o CPF aqui no chat para renovar o acesso demonstrativo e retomar a revisão da ação.',
              'Renovar acesso',
              'chat',
            ],
            'IDE-07': [
              'Não há esse dado no cenário demonstrativo. Posso oferecer ajuda.',
              'Dado indisponível',
              'chat',
            ],
            'IDE-08': ['Digite um CPF com 11 dígitos aqui no chat, com ou sem pontuação XXX.XXX.XXX-XX, para abrir a demonstração.', 'Informar CPF', 'chat'],
          }[converted.id];
          converted.title = ide[1];
          converted.bot = ide[0];
          converted.mode = ide[2];
          converted.user = '';
          converted.requiresAuth = false;
          converted.actions = converted.actions.filter((action) => action.label !== 'Informar CPF').map((action) => ({
            ...action,
            target:
              action.target === 'IDE-02' || action.target === 'IDE-01' ? 'IDE-08' : action.target,
          }));
          // SPEC 5.5: receipt is transient, then format success/error follows automatically.
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
