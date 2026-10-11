import type { LlmProvider } from '../application/ports';
import type { Intent, IntentName } from '../domain/dialog';
import { normalizeProtocol } from '../domain/identifiers';

const normalize = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/** Ordered: the first matching rule wins (specific intents before the generic ones). */
const RULES: Array<[IntentName, RegExp]> = [
  ['cancel', /\b(cancelar|voltar|sair|parar)\b/],
  [
    'claim_status',
    /\bsinistro\b.*\b(status|andamento|consultar|acompanhar|situacao)\b|\b(status|andamento|consultar|acompanhar|situacao)\b.*\bsinistro\b/,
  ],
  ['claim', /\b(sinistro|bati|colisao|roubo|roubaram|furto|furtaram|acidente|incendio)\b/],
  ['quote', /\b(cotacao|cotar|simular|simulacao|orcamento|quanto custa|preco)\b/],
  ['policies', /\b(apolice|apolices|segunda via|2a via|meu seguro|meus seguros)\b/],
  ['location', /\b(agencia|filial|endereco|onde fica|localizacao|escritorio)\b/],
  ['help', /\b(ajuda|help|o que voce faz|opcoes)\b/],
  ['greeting', /\b(oi|ola|bom dia|boa tarde|boa noite|menu|inicio|comecar)\b/],
];

const CPF_RE = /(?<![\d.-])(\d{3}\.?\d{3}\.?\d{3}-?\d{2})(?![\d])/;
const POLICY_RE = /\bap-?(\d{3,6})\b/i;
const PROTOCOL_RE = /\bsn-?(\d{3,6})\b/i;

/** Deterministic stand-in for an LLM: keyword rules plus entity extraction. */
export class MockLlmProvider implements LlmProvider {
  async classify(text: string): Promise<Intent> {
    const entities: Intent['entities'] = {};
    const cpf = CPF_RE.exec(text)?.[1];
    if (cpf) entities.cpf = cpf.replace(/\D/g, '');
    const apolice = POLICY_RE.exec(text)?.[1];
    if (apolice) entities.apolice = `AP-${apolice}`;
    const protocolo = PROTOCOL_RE.exec(text)?.[1];
    if (protocolo) entities.protocolo = normalizeProtocol(`SN-${protocolo}`) ?? undefined;
    if (entities.protocolo === undefined) delete entities.protocolo;

    const normalized = normalize(text);
    let name: IntentName = 'unknown';
    for (const [candidate, rule] of RULES) {
      if (rule.test(normalized)) {
        name = candidate;
        break;
      }
    }
    // A protocol number always means "look up that claim"; a bare policy number, "show that policy".
    if (entities.protocolo && (name === 'unknown' || name === 'claim')) name = 'claim_status';
    else if (name === 'unknown' && entities.apolice) name = 'policies';
    return { name, entities };
  }
}
