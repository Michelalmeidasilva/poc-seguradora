export type Product = 'AUTO' | 'VIDA';

export interface Money {
  valorCentavos: number;
  moeda: 'BRL';
}

export interface Coverage {
  codigo: string;
  nome: string;
  limiteCentavos: number;
}

export interface Quote {
  cotacaoId: string;
  produto: Product;
  premioMensal: Money;
  coberturas: Coverage[];
  validaAte: string;
}

export type PolicyStatus = 'ATIVA' | 'VENCIDA' | 'CANCELADA';

export interface PolicySummary {
  numero: string;
  produto: Product;
  status: PolicyStatus;
  vigenciaFim: string;
}

export interface Policy {
  numero: string;
  produto: Product;
  status: PolicyStatus;
  vigencia: { inicio: string; fim: string };
  segurado: { nome: string };
  coberturas: Coverage[];
  premio: Money & { periodicidade: string };
  proximoVencimento: string | null;
}

export interface SecondCopy {
  numero: string;
  documentoUrl: string;
  expiraEm: string;
}

export type ClaimType = 'COLISAO' | 'ROUBO' | 'FURTO' | 'INCENDIO' | 'DANOS_ELETRICOS' | 'OUTROS';

export type ClaimStatus = 'ABERTO' | 'EM_ANALISE' | 'APROVADO' | 'NEGADO' | 'ENCERRADO';

export interface ClaimOpened {
  protocolo: string;
  status: ClaimStatus;
  previsaoRetorno: string;
}

export interface Claim {
  protocolo: string;
  apoliceNumero: string;
  tipo: ClaimType;
  status: ClaimStatus;
  dataOcorrencia: string;
  timeline: Array<{ ts: string; status: ClaimStatus; descricao: string }>;
}

export type QuoteData =
  | { veiculo: { marca: string; modelo: string; ano: number }; cep: string }
  | { capitalSeguradoCentavos: number };

export interface QuoteRequest {
  produto: Product;
  cliente: { nome: string; cpf: string; dataNascimento: string };
  dados: QuoteData;
  coberturas: string[];
}

export interface ClaimRequest {
  apoliceNumero: string;
  tipo: ClaimType;
  dataOcorrencia: string;
  descricao: string;
}

/** Why a call to an internal service did not produce data (details never reach the user). */
export type ServiceFailure = 'not_found' | 'conflict' | 'invalid' | 'unavailable';
