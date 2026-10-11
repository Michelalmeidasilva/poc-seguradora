import { describe, expect, it, vi } from 'vitest';
import type { Intent } from '../domain/dialog';
import type { LlmProvider, Logger } from '../application/ports';
import { GuardedLlmProvider } from './guarded-llm-provider';

const silent: Logger = { info: () => undefined, warn: () => undefined, error: () => undefined };
const greeting: Intent = { name: 'greeting', entities: {} };
const fallback: Intent = { name: 'unknown', entities: {} };

const make = (
  inner: LlmProvider,
  o: { timeoutMs?: number; maxInputChars?: number; logger?: Logger } = {},
) =>
  new GuardedLlmProvider(inner, {
    timeoutMs: o.timeoutMs ?? 50,
    maxInputChars: o.maxInputChars ?? 10,
    logger: o.logger ?? silent,
  });

describe('GuardedLlmProvider', () => {
  it('passes the result of the inner provider through', async () => {
    expect(await make({ classify: async () => greeting }).classify('oi')).toEqual(greeting);
  });

  it('truncates the input before it reaches the inner provider', async () => {
    const classify = vi.fn<LlmProvider['classify']>(async () => greeting);
    await make({ classify }, { maxInputChars: 5 }).classify('123456789');
    expect(classify).toHaveBeenCalledWith('12345');
  });

  it('falls back to unknown when the inner provider is too slow', async () => {
    const slow: LlmProvider = { classify: () => new Promise(() => undefined) };
    expect(await make(slow, { timeoutMs: 20 }).classify('oi')).toEqual(fallback);
  });

  it('falls back to unknown when the inner provider throws, and logs without the input', async () => {
    const lines: string[] = [];
    const logger: Logger = {
      ...silent,
      warn: (o, m) => void lines.push(JSON.stringify([o, m])),
    };
    const boom: LlmProvider = {
      classify: async () => {
        throw new Error('provider exploded with MEU-SEGREDO');
      },
    };
    expect(await make(boom, { logger }).classify('MEU-SEGREDO')).toEqual(fallback);
    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain('MEU-SEGREDO');
  });

  it('falls back to unknown when the inner provider returns something malformed', async () => {
    const bad = {
      classify: async () => ({ name: 'teleport', entities: {} }),
    } as unknown as LlmProvider;
    expect(await make(bad).classify('oi')).toEqual(fallback);
  });
});
