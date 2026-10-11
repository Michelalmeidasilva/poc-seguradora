import { CircuitOpenError } from '@seguradora/resilience';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { CallContext, Logger } from '../../application/ports';
import type { QuoteRequest } from '../../domain/models';
import { startFakeServices, type FakeServices } from '../../test/fake-services';
import { HttpJsonClient } from './http-json';
import { HttpServices } from './http-services';
import {
  createServicePolicy,
  isSafeToRetry,
  isUpstreamFailure,
  ServiceHttpError,
} from './services-policy';

const silent: Logger = { info: () => undefined, warn: () => undefined, error: () => undefined };
const ctx: CallContext = {
  correlationId: 'corr-1',
  idempotencyKey: '00000000-0000-4000-8000-000000000001',
};

const policyOptions = {
  timeoutMs: 400,
  retries: 2,
  retryBaseDelayMs: 1,
  retryMaxDelayMs: 2,
  breakerFailureThreshold: 3,
  breakerResetMs: 60_000,
  bulkheadMaxConcurrent: 5,
  bulkheadMaxQueue: 5,
};

let fake: FakeServices;
beforeEach(async () => {
  fake = await startFakeServices();
});
afterEach(async () => {
  await fake.close();
});

const makeServices = (over: Partial<typeof policyOptions> = {}, baseUrl?: string) => {
  const client = () =>
    new HttpJsonClient({
      baseUrl: baseUrl ?? fake.url,
      policy: createServicePolicy({ ...policyOptions, ...over }),
      logger: silent,
    });
  return new HttpServices({ cotacao: client(), apolice: client(), sinistro: client() });
};

const quote: QuoteRequest = {
  produto: 'VIDA',
  cliente: { nome: 'Maria Souza', cpf: '12345678901', dataNascimento: '1990-05-20' },
  dados: { capitalSeguradoCentavos: 20000000 },
  coberturas: [],
};

describe('HttpServices happy paths', () => {
  it('lists policies, translating the response to the domain model', async () => {
    const r = await makeServices().listPolicies('12345678901', ctx);
    expect(r.ok && r.value.map((p) => [p.numero, p.produto, p.status, p.vigenciaFim])).toEqual([
      ['AP-1001', 'AUTO', 'ATIVA', '2026-12-31'],
      ['AP-1002', 'RESIDENCIAL', 'VENCIDA', '2025-12-31'],
      ['AP-1003', 'VIDA', 'CANCELADA', '2026-06-30'],
    ]);
  });

  it('returns an empty list for a cpf without policies', async () => {
    const r = await makeServices().listPolicies('00000000000', ctx);
    expect(r).toEqual({ ok: true, value: [] });
  });

  it('gets a policy and drops the fields the dialog does not need', async () => {
    const r = await makeServices().getPolicy('AP-1001', ctx);
    expect(r.ok && r.value.segurado).toEqual({ nome: 'Maria Souza' });
    expect(r.ok && r.value.premio).toEqual({
      valorCentavos: 18990,
      moeda: 'BRL',
      periodicidade: 'MENSAL',
    });
    expect(r.ok && 'cpfMascarado' in r.value.segurado).toBe(false);
  });

  it('gets the second copy', async () => {
    const r = await makeServices().secondCopy('AP-1001', ctx);
    expect(r.ok && r.value.documentoUrl).toBe('https://exemplo.invalid/docs/AP-1001.pdf');
  });

  it('creates a quote', async () => {
    const r = await makeServices().createQuote(quote, ctx);
    expect(r.ok && r.value.cotacaoId).toBe('CT-3001');
    expect(r.ok && r.value.coberturas).toHaveLength(2);
  });

  it('opens and gets a claim', async () => {
    const services = makeServices();
    const opened = await services.openClaim(
      {
        apoliceNumero: 'AP-1001',
        tipo: 'COLISAO',
        dataOcorrencia: '2026-10-10',
        descricao: 'Bati',
      },
      ctx,
    );
    expect(opened.ok && opened.value.protocolo).toBe('SN-2002');
    const got = await services.getClaim('SN-2001', ctx);
    expect(got.ok && got.value.timeline).toHaveLength(2);
  });
});

describe('HttpServices request shape', () => {
  it('sends the correlation id on every call and the idempotency key on POSTs', async () => {
    const services = makeServices();
    await services.getPolicy('AP-1001', ctx);
    await services.createQuote(quote, ctx);
    const [get, post] = fake.requests;
    expect(get?.headers['x-correlation-id']).toBe('corr-1');
    expect(get?.headers['idempotency-key']).toBeUndefined();
    expect(post?.headers['x-correlation-id']).toBe('corr-1');
    expect(post?.headers['idempotency-key']).toBe(ctx.idempotencyKey);
    expect(post?.headers['content-type']).toBe('application/json');
  });

  it('sends the quote body in the contract format', async () => {
    await makeServices().createQuote(quote, ctx);
    expect(fake.requests[0]?.body).toEqual({
      produto: 'VIDA',
      cliente: { nome: 'Maria Souza', cpf: '12345678901', dataNascimento: '1990-05-20' },
      dados: { capitalSeguradoCentavos: 20000000 },
      coberturas: [],
    });
  });

  it('puts the cpf in the query string and encodes path segments', async () => {
    const services = makeServices();
    await services.listPolicies('12345678901', ctx);
    expect(fake.requests[0]?.path).toBe('/v1/apolices');
    expect(fake.requests[0]?.query.get('cpf')).toBe('12345678901');
    await services.getPolicy('AP-1001', ctx);
    expect(fake.requests[1]?.path).toBe('/v1/apolices/AP-1001');
  });

  it('refuses to build a call for identifiers that do not match the expected format', async () => {
    const services = makeServices();
    expect(await services.getPolicy('AP-1/../../x', ctx)).toEqual({ ok: false, error: 'invalid' });
    expect(await services.secondCopy('AP-1001/x', ctx)).toEqual({ ok: false, error: 'invalid' });
    expect(await services.getClaim('SN-1%2F..', ctx)).toEqual({ ok: false, error: 'invalid' });
    expect(await services.listPolicies('123', ctx)).toEqual({ ok: false, error: 'invalid' });
    expect(fake.hits).toBe(0);
  });
});

describe('HttpServices failure mapping', () => {
  it.each([
    ['getPolicy', 'AP-9999', 'not_found'],
    ['getClaim', 'SN-9999', 'not_found'],
  ] as const)('maps 404 of %s to %s', async (op, arg, failure) => {
    const services = makeServices();
    const r = await (
      services[op] as (a: string, c: CallContext) => Promise<{ ok: boolean; error?: string }>
    )(arg, ctx);
    expect(r).toEqual({ ok: false, error: failure });
  });

  it('maps 409 to conflict', async () => {
    expect(await makeServices().secondCopy('AP-1003', ctx)).toEqual({
      ok: false,
      error: 'conflict',
    });
  });

  it('maps 400 to invalid', async () => {
    fake.failNext(400);
    expect(await makeServices().getPolicy('AP-1001', ctx)).toEqual({ ok: false, error: 'invalid' });
  });

  it('retries 503 and recovers', async () => {
    fake.failNext(503, 2);
    const r = await makeServices().getPolicy('AP-1001', ctx);
    expect(r.ok).toBe(true);
    expect(fake.hits).toBe(3);
  });

  it('retries a POST with the same idempotency key', async () => {
    fake.failNext(503, 1);
    const r = await makeServices().createQuote(quote, ctx);
    expect(r.ok).toBe(true);
    // The failed attempt and the retry are both recorded and carry the same key.
    const keys = fake.requests.map((q) => q.headers['idempotency-key']);
    expect(keys).toEqual([ctx.idempotencyKey, ctx.idempotencyKey]);
    expect(fake.hits).toBe(2);
  });

  it('maps a persistent 503 to unavailable after the retries', async () => {
    fake.failNext(503, 10);
    expect(await makeServices().getPolicy('AP-1001', ctx)).toEqual({
      ok: false,
      error: 'unavailable',
    });
    expect(fake.hits).toBe(3);
  });

  it('does not retry a 500 but maps it to unavailable', async () => {
    fake.failNext(500, 10);
    expect(await makeServices().getPolicy('AP-1001', ctx)).toEqual({
      ok: false,
      error: 'unavailable',
    });
    expect(fake.hits).toBe(1);
  });

  it('maps a timeout to unavailable', async () => {
    fake.delayMs = 300;
    const r = await makeServices({ timeoutMs: 50, retries: 0 }).getPolicy('AP-1001', ctx);
    expect(r).toEqual({ ok: false, error: 'unavailable' });
  });

  it('maps an unreachable service to unavailable', async () => {
    const dead = fake.url;
    await fake.close();
    const r = await makeServices({ retries: 0 }, dead).getPolicy('AP-1001', ctx);
    expect(r).toEqual({ ok: false, error: 'unavailable' });
    fake = await startFakeServices();
  });

  it('opens the circuit after repeated failures and stops calling the service', async () => {
    fake.failNext(503, 100);
    const services = makeServices({ retries: 0, breakerFailureThreshold: 2 });
    await services.getPolicy('AP-1001', ctx);
    await services.getPolicy('AP-1001', ctx);
    const hitsAtOpen = fake.hits;
    expect(await services.getPolicy('AP-1001', ctx)).toEqual({ ok: false, error: 'unavailable' });
    expect(fake.hits).toBe(hitsAtOpen);
  });

  it('maps a response that breaks the contract to unavailable without leaking it', async () => {
    const lines: string[] = [];
    const logger: Logger = { ...silent, warn: (o, m) => void lines.push(JSON.stringify([o, m])) };
    const client = new HttpJsonClient({
      baseUrl: fake.url,
      policy: createServicePolicy(policyOptions),
      logger,
    });
    // The fake answers /v1/sinistros/SN-2001 with a valid claim; the schema below expects
    // another shape, so the response breaks the contract.
    const wrong = await client.call({
      method: 'GET',
      path: '/v1/sinistros/SN-2001',
      schema: z.object({ apolices: z.array(z.string()) }),
      ctx,
    });
    expect(wrong).toEqual({ ok: false, error: 'unavailable' });
    expect(lines.join('')).not.toContain('Colisão leve');
  });
});

describe('retry and failure predicates', () => {
  it('retries timeouts, network errors and 502/503/504 only', () => {
    expect(isSafeToRetry(new TypeError('fetch failed'))).toBe(true);
    expect(isSafeToRetry(new ServiceHttpError(503))).toBe(true);
    expect(isSafeToRetry(new ServiceHttpError(502))).toBe(true);
    expect(isSafeToRetry(new ServiceHttpError(504))).toBe(true);
    expect(isSafeToRetry(new ServiceHttpError(500))).toBe(false);
    expect(isSafeToRetry(new ServiceHttpError(429))).toBe(false);
    expect(isSafeToRetry(new TypeError('invalid header value'))).toBe(false);
    expect(isSafeToRetry(new CircuitOpenError())).toBe(false);
  });

  it('counts only upstream problems as breaker failures', () => {
    expect(isUpstreamFailure(new ServiceHttpError(500))).toBe(true);
    expect(isUpstreamFailure(new ServiceHttpError(429))).toBe(true);
    expect(isUpstreamFailure(new TypeError('fetch failed'))).toBe(true);
    expect(isUpstreamFailure(new TypeError('invalid header value'))).toBe(false);
    expect(isUpstreamFailure(new ServiceHttpError(404))).toBe(false);
  });
});
