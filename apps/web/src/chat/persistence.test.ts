import { beforeEach, describe, expect, it } from 'vitest';
import { botText, uuid } from '../test/fixtures';
import { initialState, type ChatState, type UserItem } from './model';
import { loadChat, saveChat } from './persistence';
import { chatReducer } from './reducer';

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
