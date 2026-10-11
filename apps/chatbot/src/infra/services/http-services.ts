import { err, ok } from '@seguradora/protocol';
import type { CallContext, ServicesPort } from '../../application/ports';
import { isClaimProtocol, isPolicyNumber } from '../../domain/identifiers';
import type { ClaimRequest, QuoteRequest } from '../../domain/models';
import type { HttpJsonClient } from './http-json';
import {
  ClaimOpenedSchema,
  ClaimSchema,
  PolicyListSchema,
  PolicySchema,
  QuoteSchema,
  SecondCopySchema,
} from './schemas';

export interface HttpServicesClients {
  cotacao: HttpJsonClient;
  apolice: HttpJsonClient;
  sinistro: HttpJsonClient;
}

const invalid = () => Promise.resolve(err('invalid' as const));

/** Implements `ServicesPort` over the three internal services (see the services contract doc). */
export class HttpServices implements ServicesPort {
  constructor(private readonly c: HttpServicesClients) {}

  async listPolicies(cpf: string, ctx: CallContext) {
    if (!/^\d{11}$/.test(cpf)) return invalid();
    const r = await this.c.apolice.call({
      method: 'GET',
      path: '/v1/apolices',
      query: { cpf },
      schema: PolicyListSchema,
      ctx,
    });
    return r.ok
      ? ok(
          r.value.apolices.map((p) => ({
            numero: p.numero,
            produto: p.produto,
            status: p.status,
            vigenciaFim: p.vigencia.fim,
          })),
        )
      : r;
  }

  getPolicy(numero: string, ctx: CallContext) {
    if (!isPolicyNumber(numero)) return invalid();
    return this.c.apolice.call({
      method: 'GET',
      path: `/v1/apolices/${encodeURIComponent(numero)}`,
      schema: PolicySchema,
      ctx,
    });
  }

  secondCopy(numero: string, ctx: CallContext) {
    if (!isPolicyNumber(numero)) return invalid();
    return this.c.apolice.call({
      method: 'GET',
      path: `/v1/apolices/${encodeURIComponent(numero)}/segunda-via`,
      schema: SecondCopySchema,
      ctx,
    });
  }

  createQuote(request: QuoteRequest, ctx: CallContext) {
    return this.c.cotacao.call({
      method: 'POST',
      path: '/v1/cotacoes',
      body: {
        produto: request.produto,
        cliente: request.cliente,
        dados: request.dados,
        coberturas: request.coberturas,
      },
      schema: QuoteSchema,
      ctx,
    });
  }

  openClaim(request: ClaimRequest, ctx: CallContext) {
    if (!isPolicyNumber(request.apoliceNumero)) return invalid();
    return this.c.sinistro.call({
      method: 'POST',
      path: '/v1/sinistros',
      body: {
        apoliceNumero: request.apoliceNumero,
        tipo: request.tipo,
        dataOcorrencia: request.dataOcorrencia,
        descricao: request.descricao,
      },
      schema: ClaimOpenedSchema,
      ctx,
    });
  }

  getClaim(protocolo: string, ctx: CallContext) {
    if (!isClaimProtocol(protocolo)) return invalid();
    return this.c.sinistro.call({
      method: 'GET',
      path: `/v1/sinistros/${encodeURIComponent(protocolo)}`,
      schema: ClaimSchema,
      ctx,
    });
  }
}
