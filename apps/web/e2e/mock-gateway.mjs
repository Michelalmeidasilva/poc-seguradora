import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { clearInterval, setInterval } from 'node:timers';

const PORT = Number(process.env.MOCK_GATEWAY_PORT ?? 8099);
const sessions = new Map(); // sid -> { seq, buffer: [], stream: res | null, valid: true, seen: Set }

// Read at start from the chatbot's canonical copies, so the mock serves what the chatbot sends.
const FLOWS_DIR = new URL('../../chatbot/src/domain/flows/', import.meta.url);
const fixture = (name) => {
  const file = new URL(name, FLOWS_DIR);
  if (!existsSync(file)) throw new Error(`mock gateway: Flow JSON not found: ${file.pathname}`);
  return JSON.parse(readFileSync(file, 'utf8'));
};
const COTACAO_FLOW = fixture('cotacao.flow.json');
const DEMO_FLOW = fixture('demo-componentes.flow.json');
const FLOW_EVENTS = new Set(['user.flow_submit', 'user.flow_data_exchange']);

const uuid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        resolve(undefined);
      }
    });
  });
}

function cookieSid(req) {
  const raw = req.headers.cookie ?? '';
  const m = /(?:^|; )sid=([^;]+)/.exec(raw);
  return m?.[1];
}

function json(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

function publish(session, body) {
  session.seq += 1;
  const event = {
    v: 1,
    id: uuid(),
    seq: session.seq,
    sessionId: session.id,
    correlationId: 'mock',
    ts: now(),
    ...body,
  };
  session.buffer.push(event);
  if (session.buffer.length > 200) session.buffer.shift();
  if (session.stream) {
    session.stream.write(
      `id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
    );
  }
  return event;
}

const text = (t) => ({ type: 'message.text', payload: { text: t } });

function reply(session, event) {
  const said = event.type === 'user.text' ? event.payload.text.toLowerCase().trim() : '';
  publish(session, { type: 'status.typing', payload: { state: 'start' } });
  setTimeout(() => {
    publish(session, { type: 'status.typing', payload: { state: 'stop' } });
    if (event.type === 'user.flow_submit') {
      publish(session, text('Recebemos o seu formulário.'));
      return;
    }
    if (event.type === 'user.quick_reply') {
      if (event.payload.optionId === 'menu.quote') {
        publish(session, {
          type: 'message.flow',
          payload: {
            flowId: 'cotacao',
            body: 'Vamos fazer sua cotação.',
            ctaLabel: 'Começar',
            flowJson: { screens: [] },
          },
        });
      } else {
        publish(session, text(`Você escolheu ${event.payload.optionId}.`));
      }
      return;
    }
    if (said === 'oi') {
      publish(session, text('Olá! Eu sou o *assistente* virtual da Seguradora.'));
      publish(session, {
        type: 'message.quick_replies',
        payload: {
          text: 'Escolha uma opção:',
          options: [
            { id: 'menu.quote', title: 'Fazer cotação' },
            { id: 'menu.policies', title: 'Minhas apólices' },
          ],
        },
      });
    } else if (said === 'template') {
      publish(session, {
        type: 'message.template',
        payload: {
          header: 'Apólice AP-1001',
          body: 'Produto: Auto\nSituação: Ativa',
          footer: 'Valores sujeitos a análise.',
          buttons: [
            { type: 'quick_reply', id: 'policy.second_copy:AP-1001', title: 'Segunda via' },
            {
              type: 'url',
              title: 'Abrir documento',
              url: 'https://exemplo.invalid/docs/AP-1001.pdf',
            },
          ],
        },
      });
    } else if (said === 'carrossel') {
      publish(session, {
        type: 'message.carousel',
        payload: {
          cards: ['Colisão', 'Roubo e furto', 'Incêndio'].map((title) => ({
            mediaUrl: `https://exemplo.invalid/${encodeURIComponent(title)}.png`,
            mediaType: 'image',
            title,
            body: 'Limite: R$ 50.000,00',
            buttons: [],
          })),
        },
      });
    } else if (said === 'codigo') {
      publish(session, { type: 'message.code', payload: { code: 'Protocolo: SN-2002' } });
    } else if (said === 'local') {
      publish(session, {
        type: 'message.location',
        payload: {
          latitude: -23.5614,
          longitude: -46.6559,
          name: 'Agência Paulista',
          address: 'Av. Paulista, 1000',
        },
      });
    } else if (said === 'audio') {
      publish(session, {
        type: 'message.voice',
        payload: { mediaUrl: 'https://exemplo.invalid/a.ogg', durationMs: 4000 },
      });
    } else if (said === 'fluxo') {
      publish(session, {
        type: 'message.flow',
        payload: {
          flowId: 'cotacao',
          body: 'Preencha o formulário.',
          ctaLabel: 'Começar',
          flowJson: { screens: [] },
        },
      });
    } else if (said === 'cotacao flow') {
      publish(session, {
        type: 'message.flow',
        payload: {
          flowId: 'cotacao',
          header: 'Cotação',
          body: 'Vamos calcular a sua cotação.',
          ctaLabel: 'Abrir cotação',
          flowJson: COTACAO_FLOW,
        },
      });
    } else if (said === 'demo flow') {
      publish(session, {
        type: 'message.flow',
        payload: {
          flowId: 'demo',
          body: 'Conheça todos os componentes.',
          ctaLabel: 'Abrir demonstração',
          flowJson: DEMO_FLOW,
        },
      });
    } else if (said === 'erro') {
      publish(session, {
        type: 'error',
        payload: {
          code: 'upstream_unavailable',
          message: 'O atendimento está indisponível no momento.',
          messageId: event.id,
        },
      });
      session.failedOnce.add(event.id);
    } else if (said === 'queda') {
      publish(session, text('Vou derrubar a conexão.'));
      session.stream?.end();
      session.stream = null;
    } else if (said === 'sessao') {
      session.valid = false;
      publish(session, text('Sessão invalidada.'));
    } else {
      publish(
        session,
        text(`Você disse: ${event.type === 'user.text' ? event.payload.text : event.type}`),
      );
    }
  }, 40);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://mock');

  if (req.method === 'POST' && url.pathname === '/v1/session') {
    const id = uuid();
    sessions.set(id, {
      id,
      seq: 0,
      buffer: [],
      stream: null,
      valid: true,
      seen: new Set(),
      failedOnce: new Set(),
      flowEvents: [],
    });
    return json(
      res,
      201,
      { sessionId: id },
      { 'set-cookie': `sid=${id}; HttpOnly; Path=/; SameSite=Lax` },
    );
  }

  const session = sessions.get(cookieSid(req) ?? '');
  const authorized = session?.valid === true;

  if (req.method === 'GET' && url.pathname === '/v1/stream') {
    if (!authorized || !session)
      return json(res, 401, { error: { code: 'unauthorized', message: 'Sessão inválida.' } });
    session.stream?.end();
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    res.write('retry: 500\n\n');
    session.stream = res;
    const last = Number(req.headers['last-event-id'] ?? 0) || 0;
    for (const e of session.buffer.filter((x) => x.seq > last)) {
      res.write(`id: ${e.seq}\nevent: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
    }
    const heartbeat = setInterval(() => res.write(': hb\n\n'), 5000);
    req.on('close', () => {
      clearInterval(heartbeat);
      if (session.stream === res) session.stream = null;
    });
    return undefined;
  }

  if (req.method === 'POST' && url.pathname === '/v1/events') {
    if (!authorized || !session)
      return json(res, 401, { error: { code: 'unauthorized', message: 'Sessão inválida.' } });
    const event = await readBody(req);
    if (!event || typeof event.id !== 'string' || typeof event.type !== 'string') {
      return json(res, 400, { error: { code: 'invalid_schema', message: 'Evento inválido.' } });
    }
    // Like the real gateway: the envelope must belong to the session of the cookie.
    if (event.sessionId !== session.id) {
      return json(res, 403, { error: { code: 'unauthorized', message: 'Sessão inválida.' } });
    }
    // Test hook: every accepted event is recorded so the tests can assert ids and order.
    session.posted = session.posted ?? [];
    session.posted.push(event);
    // Flow events: only the type and payload are kept (no ids, cookies or headers).
    if (FLOW_EVENTS.has(event.type)) {
      session.flowEvents.push({ type: event.type, payload: event.payload });
    }
    if (event.type === 'user.ack') return json(res, 202, { status: 'accepted' });
    // Intentional deviation from the real gateway: a retried id that failed ('erro') is reprocessed
    // as accepted, whereas the real gateway would answer 200 duplicate.
    if (session.seen.has(event.id) && !session.failedOnce.has(event.id)) {
      return json(res, 200, { status: 'duplicate' });
    }
    session.failedOnce.delete(event.id);
    session.seen.add(event.id);
    json(res, 202, { status: 'accepted' });
    publish(session, { type: 'status.delivered', payload: { messageId: event.id } });
    // Like the chatbot today: a data exchange gets no answer.
    if (event.type !== 'user.flow_data_exchange') reply(session, event);
    return undefined;
  }

  // Test hooks (not part of the gateway contract)
  if (req.method === 'GET' && url.pathname === '/__posted') {
    return json(res, 200, { posted: (session?.posted ?? []).filter((e) => e.type !== 'user.ack') });
  }

  if (req.method === 'GET' && url.pathname === '/__events') {
    return json(res, 200, { events: session?.flowEvents ?? [] });
  }

  return json(res, 404, { error: { code: 'invalid_schema', message: 'Rota não encontrada.' } });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`mock gateway listening on ${PORT}`);
});
