import { beforeEach, describe, expect, it } from 'vitest';
import { botText, uuid } from '../test/fixtures';
import { initialState, type ChatState, type UserItem } from './model';
import { loadChat, saveChat } from './persistence';
import { chatReducer } from './reducer';
import catalog from '../../../chatbot/src/domain/assistance-catalog.generated.json';

const KEY = 'seguradora-chat:v1';
beforeEach(() => sessionStorage.clear());

const sample = (): ChatState => {
  let s = initialState();
  s = chatReducer(s, { type: 'session', sessionId: 's9' });
  s = chatReducer(s, { type: 'server_event', event: botText(1, 'oi') });
  s = chatReducer(s, { type: 'server_event', event: botText(2, 'tudo bem?') });
  return s;
};

describe('persistence', () => {
  const userText = (text: string): UserItem => ({
    kind: 'user', id: uuid(99), ts: '2026-10-10T12:00:00.000Z',
    status: 'sent', content: { type: 'text', text },
  });

  it.each([
    ['Meu CPF é 98765432100.', 'Meu CPF é *********00.'],
    ['CPF 987.654.321-00; confirme.', 'CPF ***.***.***-00; confirme.'],
    ['Sem documento nesta mensagem.', 'Sem documento nesta mensagem.'],
    ['Protocolo 123456789012 não é CPF.', 'Protocolo 123456789012 não é CPF.'],
  ])('persists user text with recognized CPF masked: %s', (text, expected) => {
    const live = chatReducer(sample(), { type: 'user_queued', item: userText(text) });
    saveChat(sessionStorage, live);
    expect(live.items.at(-1)).toMatchObject({ content: { text } });
    expect(JSON.parse(sessionStorage.getItem(KEY)!).items.at(-1).content.text).toBe(expected);
    expect(loadChat(sessionStorage)?.items.at(-1)).toMatchObject({ content: { text: expected } });
  });

  it('sanitizes old user text and rewrites storage before returning the restored state', () => {
    const text = 'CPF 98765432100 e 123.456.789-01';
    sessionStorage.setItem(KEY, JSON.stringify({
      v: 1, sessionId: 's9', lastSeq: 0, items: [userText(text)],
    }));
    const loaded = loadChat(sessionStorage);
    const expected = 'CPF *********00 e ***.***.***-01';
    expect(loaded?.items[0]).toMatchObject({ content: { text: expected } });
    expect(JSON.parse(sessionStorage.getItem(KEY)!).items[0].content.text).toBe(expected);
    expect(sessionStorage.getItem(KEY)).not.toContain('98765432100');
  });

  it('does not expose old CPF text if the storage rewrite fails', () => {
    sessionStorage.setItem(KEY, JSON.stringify({
      v: 1, sessionId: 's9', lastSeq: 0, items: [userText('CPF 98765432100')],
    }));
    const broken = {
      getItem: (key: string) => sessionStorage.getItem(key),
      setItem: () => { throw new Error('QuotaExceededError'); },
      removeItem: (key: string) => sessionStorage.removeItem(key),
    } as unknown as Storage;
    expect(loadChat(broken)).toBeUndefined();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  const catalogSteps = catalog.groups.flatMap((group) =>
    group.steps.map(({ id, mode }) => ({ id, mode })),
  );
  const legacyReview = (flowId: string) => chatReducer(sample(), {
    type: 'server_event',
    event: {
      ...botText(3), type: 'message.flow',
      payload: {
        flowId, body: 'Revise', ctaLabel: 'Confirmar',
        flowJson: { version: '7.1', screens: [{ id: 'REVIEW', terminal: true, layout: {
          type: 'SingleColumnLayout', children: [{ type: 'Footer', label: 'Confirmar',
            'on-click-action': { name: 'complete', payload: { confirmed: true } } }],
        } }] },
      },
    },
  });

  it.each(catalogSteps)('scopes legacy detection to canonical review mode: $id ($mode)', ({ id, mode }) => {
    const live = legacyReview(id);
    // Exercise old raw snapshots and normal saves independently.
    sessionStorage.setItem(KEY, JSON.stringify({ v: 1, ...live }));
    const expectedType = mode === 'review' ? 'message.text' : 'message.flow';
    expect(loadChat(sessionStorage)?.items.at(-1)).toMatchObject({ event: { type: expectedType } });
    expect(JSON.parse(sessionStorage.getItem(KEY)!).items.at(-1)).toMatchObject({ event: { type: expectedType } });
    saveChat(sessionStorage, live);
    expect(loadChat(sessionStorage)?.items.at(-1)).toMatchObject({ event: { type: expectedType } });
    expect(live.items.at(-1)).toMatchObject({ event: { type: 'message.flow', payload: { ctaLabel: 'Confirmar' } } });
  });

  it('preserves an unrelated terminal REVIEW Flow and its complete action after save/load', () => {
    const live = legacyReview('external-review');
    saveChat(sessionStorage, live);
    expect(loadChat(sessionStorage)?.items).toEqual(live.items);
    expect(JSON.parse(sessionStorage.getItem(KEY)!).items).toEqual(live.items);
  });

  it.each([false, true])('never restores an unsafe snapshot when rewriting fails (removal fails: %s)', (removalFails) => {
    const live = legacyReview('DEP-06');
    sessionStorage.setItem(KEY, JSON.stringify({ v: 1, ...live }));
    const broken = {
      getItem: (key: string) => sessionStorage.getItem(key),
      setItem: () => { throw new Error('QuotaExceededError'); },
      removeItem: (key: string) => {
        if (removalFails) throw new Error('SecurityError');
        sessionStorage.removeItem(key);
      },
    } as unknown as Storage;
    expect(loadChat(broken)).toBeUndefined();
    if (!removalFails) expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('round-trips the session, the seq and the messages', () => {
    saveChat(sessionStorage, sample());
    const loaded = loadChat(sessionStorage);
    expect(loaded?.sessionId).toBe('s9');
    expect(loaded?.lastSeq).toBe(2);
    expect(loaded?.items).toHaveLength(2);
    expect(Object.keys(loaded?.seen ?? {})).toHaveLength(2);
  });

  it('returns undefined when nothing is stored', () => {
    expect(loadChat(sessionStorage)).toBeUndefined();
  });

  it.each([
    'not json',
    '{"v":2}',
    '{"v":1,"sessionId":5}',
    '{"v":1,"sessionId":"a","lastSeq":"x","items":[]}',
    'null',
  ])('ignores invalid stored data (%s)', (raw) => {
    sessionStorage.setItem(KEY, raw);
    expect(loadChat(sessionStorage)).toBeUndefined();
  });

  it('keeps only the last 200 items', () => {
    let s = initialState();
    s = chatReducer(s, { type: 'session', sessionId: 's9' });
    for (let n = 1; n <= 260; n++) s = chatReducer(s, { type: 'server_event', event: botText(n) });
    saveChat(sessionStorage, s);
    expect(loadChat(sessionStorage)?.items).toHaveLength(200);
  });

  it('does not persist blob URLs and turns in-flight messages into failed ones', () => {
    const voice: UserItem = {
      kind: 'user',
      id: uuid(1),
      ts: '2026-10-10T12:00:00.000Z',
      status: 'sending',
      content: { type: 'voice', durationMs: 2000, objectUrl: 'blob:http://x/abc' },
    };
    saveChat(sessionStorage, chatReducer(sample(), { type: 'user_queued', item: voice }));
    expect(sessionStorage.getItem(KEY)).not.toContain('blob:');
    const item = loadChat(sessionStorage)?.items.find((i) => i.kind === 'user');
    expect(item).toMatchObject({ status: 'failed', content: { type: 'voice' } });
  });

  it('stores a flow submission as its summary only, never its data', () => {
    const submit: UserItem = {
      kind: 'user',
      id: uuid(2),
      ts: '2026-10-10T12:00:00.000Z',
      status: 'sent',
      content: { type: 'flow_submit', flowId: 'cotacao', summary: 'CPF: ••••' },
    };
    const withData = {
      ...submit,
      content: { ...submit.content, data: { cpf: '12345678901' } },
    } as unknown as UserItem;
    saveChat(sessionStorage, chatReducer(sample(), { type: 'user_queued', item: withData }));
    expect(sessionStorage.getItem(KEY)).not.toContain('12345678901');
    const item = loadChat(sessionStorage)?.items.find((i) => i.kind === 'user');
    expect(item).toEqual(submit);
  });

  it('drops data from flow submissions saved by an older version', () => {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({
        v: 1,
        sessionId: 's9',
        lastSeq: 0,
        items: [
          {
            kind: 'user',
            id: uuid(3),
            ts: '2026-10-10T12:00:00.000Z',
            status: 'sent',
            content: { type: 'flow_submit', flowId: 'f', summary: 'ok', data: { cpf: '1' } },
          },
        ],
      }),
    );
    const item = loadChat(sessionStorage)?.items[0];
    expect(item?.kind === 'user' && item.content).toEqual({
      type: 'flow_submit',
      flowId: 'f',
      summary: 'ok',
    });
    expect(sessionStorage.getItem(KEY)).not.toContain('"data"');
  });

  it('masks CPF in a flow summary and removes old payload data on save and load', () => {
    const summary = 'CPF 987.654.321-00 confirmado';
    const expected = 'CPF ***.***.***-00 confirmado';
    const legacy = {
      kind: 'user', id: uuid(30), ts: '2026-10-10T12:00:00.000Z', status: 'sent',
      content: { type: 'flow_submit', flowId: 'cotacao', summary, data: { cpf: '12345678901' } },
    } as unknown as UserItem;
    const live = chatReducer(sample(), { type: 'user_queued', item: legacy });
    saveChat(sessionStorage, live);
    expect(live.items.at(-1)).toMatchObject({ content: { summary } });
    expect(JSON.parse(sessionStorage.getItem(KEY)!).items.at(-1).content).toEqual({
      type: 'flow_submit', flowId: 'cotacao', summary: expected,
    });

    sessionStorage.setItem(KEY, JSON.stringify({
      v: 1, sessionId: 's9', lastSeq: 0, items: [legacy],
    }));
    expect(loadChat(sessionStorage)?.items[0]).toMatchObject({ content: { summary: expected } });
    expect(JSON.parse(sessionStorage.getItem(KEY)!).items[0].content).toEqual({
      type: 'flow_submit', flowId: 'cotacao', summary: expected,
    });
    expect(sessionStorage.getItem(KEY)).not.toContain('987.654.321-00');
    expect(sessionStorage.getItem(KEY)).not.toContain('12345678901');
  });

  it.each(['DEP-06', 'external-review'])('does not persist volatile Flow initialData for %s', (flowId) => {
    const event = {
      v: 1 as const, id: uuid(4), seq: 3, sessionId: 's9', correlationId: 'c', ts: '2026-10-10T12:00:00.000Z',
      type: 'message.flow' as const,
      payload: { flowId, body: 'Revise', ctaLabel: 'Abrir', flowJson: {}, initialData: { intent: 'review' as const, values: { cpf: 'CPF-CANARY-98765432100', name: 'Ana' } } },
    };
    const live = chatReducer(sample(), { type: 'server_event', event });
    saveChat(sessionStorage, live);
    expect(sessionStorage.getItem(KEY)).not.toContain('CPF-CANARY-98765432100');
    expect(sessionStorage.getItem(KEY)).not.toContain('initialData');
    const liveFlow = live.items.find((item) => item.kind === 'bot' && item.event.type === 'message.flow');
    expect(liveFlow).toMatchObject({ kind: 'bot', event: { type: 'message.flow', payload: { ctaLabel: 'Abrir', initialData: { intent: 'review' } } } });
    const saved = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as {
      items: Array<{
        kind: string;
        event?: { type: string; payload?: { text?: string; ctaLabel?: string } };
      }>;
    };
    const expired = saved.items.find((item) => item.kind === 'bot' && item.event?.payload?.text?.includes('expirou'));
    expect(expired?.event?.type).toBe('message.text');
    expect(expired?.event?.payload?.ctaLabel).toBeUndefined();
  });

  it.each(['DEP-06', 'external-review'])('scrubs volatile Flow initialData from legacy messages for %s', (flowId) => {
    sessionStorage.setItem(KEY, JSON.stringify({
      v: 1, sessionId: 's9', lastSeq: 3,
      items: [{ kind: 'bot', id: uuid(5), ts: '2026-10-10T12:00:00.000Z', event: {
        v: 1, id: uuid(6), seq: 3, sessionId: 's9', correlationId: 'c', ts: '2026-10-10T12:00:00.000Z', type: 'message.flow',
        payload: { flowId, body: 'Revise', ctaLabel: 'Abrir', flowJson: {}, initialData: { intent: 'correction', values: { cpf: 'CPF-CANARY-98765432100' } } },
      } }],
    }));
    const loaded = loadChat(sessionStorage);
    const serialized = JSON.stringify(loaded);
    expect(serialized).not.toContain('CPF-CANARY-98765432100');
    expect(serialized).not.toContain('initialData');
    const storedImmediatelyAfterLoad = sessionStorage.getItem(KEY) ?? '';
    expect(storedImmediatelyAfterLoad).not.toContain('CPF-CANARY-98765432100');
    expect(storedImmediatelyAfterLoad).not.toContain('initialData');
    expect(serialized).not.toContain('message.flow');
    const expired = loaded?.items.find((item) => item.kind === 'bot' && item.event.type === 'message.text');
    expect(expired?.kind === 'bot' && expired.event.type === 'message.text' && expired.event.payload.text).toMatch(/expirou/i);
    expect(storedImmediatelyAfterLoad).not.toContain('message.flow');
  });

  it('expires legacy terminal REVIEW Flows even when initialData was already stripped', () => {
    sessionStorage.setItem(KEY, JSON.stringify({
      v: 1, sessionId: 's9', lastSeq: 3,
      items: [{ kind: 'bot', id: uuid(7), ts: '2026-10-10T12:00:00.000Z', event: {
        v: 1, id: uuid(8), seq: 3, sessionId: 's9', correlationId: 'c', ts: '2026-10-10T12:00:00.000Z', type: 'message.flow',
        payload: {
          flowId: 'DEP-06', body: 'Revise seus dados', ctaLabel: 'Confirmar solicitação',
          flowJson: { version: '7.1', screens: [{ id: 'REVIEW', terminal: true, layout: { type: 'SingleColumnLayout', children: [{ type: 'TextBody', text: 'CPF: ••00 — Rua Canary' }, { type: 'Footer', label: 'Confirmar' }] } }] },
        },
      } }],
    }));

    const loaded = loadChat(sessionStorage);
    const serialized = JSON.stringify(loaded);
    const storedImmediatelyAfterLoad = sessionStorage.getItem(KEY) ?? '';
    expect(serialized).not.toContain('Rua Canary');
    expect(serialized).not.toContain('message.flow');
    expect(serialized).not.toContain('Confirmar solicitação');
    expect(serialized).toContain('message.text');
    expect(storedImmediatelyAfterLoad).not.toContain('Rua Canary');
    expect(storedImmediatelyAfterLoad).not.toContain('message.flow');
    expect(storedImmediatelyAfterLoad).not.toContain('Confirmar solicitação');
    expect(storedImmediatelyAfterLoad).toContain('message.text');
    expect(loaded?.items[0]).toMatchObject({ kind: 'bot', event: { type: 'message.text' } });
  });

  it('does not throw when the storage is full or unavailable', () => {
    const broken = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    } as unknown as Storage;
    expect(() => saveChat(broken, sample())).not.toThrow();
  });
});
