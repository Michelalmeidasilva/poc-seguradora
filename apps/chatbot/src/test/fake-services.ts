import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface RecordedRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: IncomingHttpHeaders;
  body: unknown;
}

export interface FakeServices {
  /** One server answers the three services (the paths do not overlap). */
  url: string;
  requests: RecordedRequest[];
  /** Every HTTP request received, including the ones answered with an injected failure. */
  hits: number;
  /** Answers the next `count` requests with this status instead of the normal response. */
  failNext(status: number, count?: number): void;
  /** Delays every response (milliseconds). */
  delayMs: number;
  close(): Promise<void>;
}

interface FakePolicy {
  numero: string;
  produto: string;
  status: string;
  vigencia: object;
  [field: string]: unknown;
}

/** Loose view of the parsed request body (the fake only reads a few fields). */
type LooseBody = { produto?: unknown; cliente?: unknown; apoliceNumero?: string } | undefined;

const POLICIES: Record<string, FakePolicy> = {
  'AP-1001': {
    numero: 'AP-1001',
    produto: 'AUTO',
    status: 'ATIVA',
    vigencia: { inicio: '2026-01-01', fim: '2026-12-31' },
    segurado: { nome: 'Maria Souza', cpfMascarado: '***.456.789-**' },
    coberturas: [{ codigo: 'COLISAO', nome: 'Colisão', limiteCentavos: 5000000 }],
    premio: { valorCentavos: 18990, moeda: 'BRL', periodicidade: 'MENSAL' },
    proximoVencimento: '2026-11-10',
  },
  'AP-1002': {
    numero: 'AP-1002',
    produto: 'RESIDENCIAL',
    status: 'VENCIDA',
    vigencia: { inicio: '2025-01-01', fim: '2025-12-31' },
    segurado: { nome: 'Maria Souza', cpfMascarado: '***.456.789-**' },
    coberturas: [],
    premio: { valorCentavos: 9000, moeda: 'BRL', periodicidade: 'MENSAL' },
    proximoVencimento: null,
  },
  'AP-1003': {
    numero: 'AP-1003',
    produto: 'VIDA',
    status: 'CANCELADA',
    vigencia: { inicio: '2025-01-01', fim: '2026-06-30' },
    segurado: { nome: 'Maria Souza', cpfMascarado: '***.456.789-**' },
    coberturas: [],
    premio: { valorCentavos: 5000, moeda: 'BRL', periodicidade: 'MENSAL' },
    proximoVencimento: null,
  },
};

const CLAIM = {
  protocolo: 'SN-2001',
  apoliceNumero: 'AP-1001',
  tipo: 'COLISAO',
  status: 'EM_ANALISE',
  dataOcorrencia: '2026-09-30',
  descricao: 'Colisão leve',
  timeline: [
    { ts: '2026-10-01T09:00:00Z', status: 'ABERTO', descricao: 'Sinistro registrado' },
    { ts: '2026-10-02T14:00:00Z', status: 'EM_ANALISE', descricao: 'Em análise pela equipe' },
  ],
};

const json = (status: number, body: unknown) => ({ status, body });
const error = (status: number, code: string) =>
  json(status, { error: { code, message: code, correlationId: 'x' } });

function route(method: string, path: string, query: URLSearchParams, body: LooseBody) {
  if (method === 'GET' && path === '/v1/apolices') {
    if (!/^\d{11}$/.test(query.get('cpf') ?? '')) return error(400, 'validation_error');
    if (query.get('cpf') !== '12345678901') return json(200, { apolices: [] });
    return json(200, {
      apolices: Object.values(POLICIES).map((p) => ({
        numero: p.numero,
        produto: p.produto,
        status: p.status,
        vigencia: p.vigencia,
      })),
    });
  }
  const second = /^\/v1\/apolices\/([^/]+)\/segunda-via$/.exec(path);
  if (method === 'GET' && second) {
    const policy = POLICIES[decodeURIComponent(second[1] ?? '')];
    if (!policy) return error(404, 'not_found');
    if (policy.status === 'CANCELADA') return error(409, 'conflict');
    return json(200, {
      numero: policy.numero,
      documentoUrl: `https://exemplo.invalid/docs/${policy.numero}.pdf`,
      geradoEm: '2026-10-10T12:00:00Z',
      expiraEm: '2026-10-10T13:00:00Z',
    });
  }
  const one = /^\/v1\/apolices\/([^/]+)$/.exec(path);
  if (method === 'GET' && one) {
    const policy = POLICIES[decodeURIComponent(one[1] ?? '')];
    return policy ? json(200, policy) : error(404, 'not_found');
  }
  if (method === 'POST' && path === '/v1/cotacoes') {
    if (!body?.produto || !body?.cliente) return error(400, 'validation_error');
    return json(201, {
      cotacaoId: 'CT-3001',
      produto: body.produto,
      status: 'CALCULADA',
      premioMensal: { valorCentavos: 18990, moeda: 'BRL' },
      coberturas: [
        { codigo: 'COLISAO', nome: 'Colisão', limiteCentavos: 5000000 },
        { codigo: 'ROUBO', nome: 'Roubo e furto', limiteCentavos: 4500000 },
      ],
      criadaEm: '2026-10-10T12:00:00Z',
      validaAte: '2026-10-17',
    });
  }
  if (method === 'POST' && path === '/v1/sinistros') {
    const policy = POLICIES[body?.apoliceNumero ?? ''];
    if (!policy) return error(404, 'not_found');
    if (policy.status !== 'ATIVA') return error(409, 'conflict');
    return json(201, {
      protocolo: 'SN-2002',
      status: 'ABERTO',
      criadoEm: '2026-10-10T12:00:00Z',
      previsaoRetorno: '2026-10-15',
    });
  }
  const claim = /^\/v1\/sinistros\/([^/]+)$/.exec(path);
  if (method === 'GET' && claim) {
    return decodeURIComponent(claim[1] ?? '') === 'SN-2001'
      ? json(200, CLAIM)
      : error(404, 'not_found');
  }
  return error(404, 'not_found');
}

export async function startFakeServices(): Promise<FakeServices> {
  let failures: { status: number; left: number } | undefined;
  const fake: FakeServices = {
    url: '',
    requests: [],
    hits: 0,
    delayMs: 0,
    failNext: (status, count = 1) => {
      failures = { status, left: count };
    },
    close: () => Promise.resolve(),
  };

  const server: Server = createServer((req, res) => {
    fake.hits++;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://fake');
      const raw = Buffer.concat(chunks).toString('utf8');
      let body: unknown;
      try {
        body = raw ? JSON.parse(raw) : undefined;
      } catch {
        body = undefined;
      }
      fake.requests.push({
        method: req.method ?? 'GET',
        path: url.pathname,
        query: url.searchParams,
        headers: req.headers,
        body,
      });
      const reply = () => {
        const injected = failures && failures.left > 0 ? failures : undefined;
        const out = injected
          ? error(injected.status, 'injected')
          : route(req.method ?? 'GET', url.pathname, url.searchParams, body as LooseBody);
        if (injected) injected.left--;
        res.writeHead(out.status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(out.body));
      };
      if (fake.delayMs > 0) setTimeout(reply, fake.delayMs);
      else reply();
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  fake.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  fake.close = () =>
    new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    });
  return fake;
}
