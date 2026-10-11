import type {
  Claim,
  ClaimOpened,
  Policy,
  PolicySummary,
  Quote,
  SecondCopy,
} from '../domain/models';

export const aPolicySummary = (over: Partial<PolicySummary> = {}): PolicySummary => ({
  numero: 'AP-1001',
  produto: 'AUTO',
  status: 'ATIVA',
  vigenciaFim: '2026-12-31',
  ...over,
});

export const aPolicy = (over: Partial<Policy> = {}): Policy => ({
  numero: 'AP-1001',
  produto: 'AUTO',
  status: 'ATIVA',
  vigencia: { inicio: '2026-01-01', fim: '2026-12-31' },
  segurado: { nome: 'Maria Souza' },
  coberturas: [{ codigo: 'COLISAO', nome: 'Colisão', limiteCentavos: 5000000 }],
  premio: { valorCentavos: 18990, moeda: 'BRL', periodicidade: 'MENSAL' },
  proximoVencimento: '2026-11-10',
  ...over,
});

export const aQuote = (over: Partial<Quote> = {}): Quote => ({
  cotacaoId: 'CT-3001',
  produto: 'AUTO',
  premioMensal: { valorCentavos: 18990, moeda: 'BRL' },
  coberturas: [
    { codigo: 'COLISAO', nome: 'Colisão', limiteCentavos: 5000000 },
    { codigo: 'ROUBO', nome: 'Roubo e furto', limiteCentavos: 4500000 },
  ],
  validaAte: '2026-10-17',
  ...over,
});

export const aClaimOpened = (over: Partial<ClaimOpened> = {}): ClaimOpened => ({
  protocolo: 'SN-2002',
  status: 'ABERTO',
  previsaoRetorno: '2026-10-15',
  ...over,
});

export const aClaim = (over: Partial<Claim> = {}): Claim => ({
  protocolo: 'SN-2001',
  apoliceNumero: 'AP-1001',
  tipo: 'COLISAO',
  status: 'EM_ANALISE',
  dataOcorrencia: '2026-09-30',
  timeline: [
    { ts: '2026-10-01T09:00:00Z', status: 'ABERTO', descricao: 'Sinistro registrado' },
    { ts: '2026-10-02T14:00:00Z', status: 'EM_ANALISE', descricao: 'Em análise pela equipe' },
  ],
  ...over,
});

export const aSecondCopy = (over: Partial<SecondCopy> = {}): SecondCopy => ({
  numero: 'AP-1001',
  documentoUrl: 'https://exemplo.invalid/docs/AP-1001.pdf',
  expiraEm: '2026-10-10T13:00:00Z',
  ...over,
});
