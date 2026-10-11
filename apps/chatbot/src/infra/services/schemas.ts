import { httpUrl } from '@seguradora/protocol';
import { z } from 'zod';

/** Identifiers echoed back to the user (and into button ids) must have the documented format. */
const policyNumber = z.string().regex(/^AP-\d{3,6}$/);
const claimProtocol = z.string().regex(/^SN-\d{3,6}$/);

const product = z.enum(['AUTO', 'RESIDENCIAL', 'VIDA']);
const money = z.object({ valorCentavos: z.number().int(), moeda: z.literal('BRL') });
const coverage = z.object({
  codigo: z.string(),
  nome: z.string(),
  limiteCentavos: z.number().int(),
});
const policyStatus = z.enum(['ATIVA', 'VENCIDA', 'CANCELADA']);
const claimStatus = z.enum(['ABERTO', 'EM_ANALISE', 'APROVADO', 'NEGADO', 'ENCERRADO']);

export const PolicyListSchema = z.object({
  apolices: z.array(
    z.object({
      numero: policyNumber,
      produto: product,
      status: policyStatus,
      vigencia: z.object({ inicio: z.string(), fim: z.string() }),
    }),
  ),
});

export const PolicySchema = z.object({
  numero: policyNumber,
  produto: product,
  status: policyStatus,
  vigencia: z.object({ inicio: z.string(), fim: z.string() }),
  segurado: z.object({ nome: z.string() }),
  coberturas: z.array(coverage),
  premio: money.extend({ periodicidade: z.string() }),
  proximoVencimento: z.string().nullable(),
});

export const SecondCopySchema = z.object({
  numero: policyNumber,
  // http(s) only: the URL becomes a button the user opens.
  documentoUrl: httpUrl,
  geradoEm: z.string(),
  expiraEm: z.string(),
});

export const QuoteSchema = z.object({
  cotacaoId: z.string(),
  produto: product,
  premioMensal: money,
  coberturas: z.array(coverage),
  validaAte: z.string(),
});

export const ClaimOpenedSchema = z.object({
  protocolo: claimProtocol,
  status: claimStatus,
  previsaoRetorno: z.string(),
});

export const ClaimSchema = z.object({
  protocolo: claimProtocol,
  apoliceNumero: policyNumber,
  tipo: z.enum(['COLISAO', 'ROUBO', 'FURTO', 'INCENDIO', 'DANOS_ELETRICOS', 'OUTROS']),
  status: claimStatus,
  dataOcorrencia: z.string(),
  timeline: z.array(z.object({ ts: z.string(), status: claimStatus, descricao: z.string() })),
});
