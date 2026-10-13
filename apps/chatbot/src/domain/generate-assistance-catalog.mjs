import { readFileSync, writeFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';

const catalogUrl = new URL('../../../../docs/prototypes/whatsapp-experience/catalog.js', import.meta.url);
const source = readFileSync(catalogUrl, 'utf8');
const sandbox = { window: {} };
runInNewContext(source, sandbox, { timeout: 1_000 });
const canonical = sandbox.window.EXPERIENCE;
if (!canonical || canonical.total !== 247) throw new Error('unexpected canonical catalog structure');

const groups = canonical.groups
  .filter((group) => group.code !== 'LEG')
  .map((group) => ({
    id: group.code,
    title: group.title,
    steps: group.steps.filter((step) => !step.id.startsWith('LEG-')).map((step) => {
      const converted = { ...step, journeyId: step.journey };
      delete converted.journey;
      delete converted.position;
      if (converted.id.startsWith('IDE-')) {
        const ide = {
          'IDE-01': ['Para abrir esta demonstração, informe um CPF com 11 dígitos. Este formato não confirma identidade.', 'Informe o CPF', 'form'],
          'IDE-02': ['Recebi o CPF para validar o formato da demonstração.', 'Validando formato', 'chat'],
          'IDE-03': ['O formato do CPF foi aceito. Os dados seguintes pertencem a um cenário fictício.', 'Formato aceito', 'chat'],
          'IDE-04': ['O CPF precisa ter 11 dígitos. Tente novamente ou peça ajuda.', 'Formato inválido', 'chat'],
          'IDE-05': ['A sessão demonstrativa expirou. Informe novamente o CPF para continuar.', 'Sessão expirada', 'chat'],
          'IDE-06': ['Confirme explicitamente se deseja concluir esta ação demonstrativa.', 'Confirmar ação', 'review'],
          'IDE-07': ['Não há esse dado no cenário demonstrativo. Posso oferecer ajuda.', 'Dado indisponível', 'chat'],
          'IDE-08': ['Informe um CPF com 11 dígitos para abrir a demonstração.', 'CPF', 'form'],
        }[converted.id];
        converted.title = ide[1];
        converted.bot = ide[0];
        converted.mode = ide[2];
        converted.user = '';
        converted.requiresAuth = false;
        converted.actions = converted.actions.map((action) => ({
          ...action,
          target: action.target === 'IDE-02' || action.target === 'IDE-01' ? 'IDE-08' : action.target,
        }));
        if (converted.flow) {
          converted.flow = { ...converted.flow, fields: [{ name: 'cpf', label: 'CPF', required: true, sensitive: true }], target: 'IDE-02' };
          delete converted.flow.choices;
          delete converted.flow.sections;
        }
      }
      return converted;
    }),
  }));

const output = JSON.stringify({ version: canonical.version, groups }, null, 2) + '\n';
writeFileSync(fileURLToPath(new URL('./assistance-catalog.generated.json', import.meta.url)), output);
