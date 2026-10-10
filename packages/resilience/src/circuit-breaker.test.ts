import { describe, expect, it } from 'vitest';
import { CircuitBreaker, CircuitOpenError } from './circuit-breaker';

const fail = async () => {
  throw new Error('down');
};
const succeed = async () => 'ok';

const make = (
  overrides: { failureThreshold?: number; isFailure?: (e: unknown) => boolean } = {},
) => {
  const clock = { t: 0 };
  const breaker = new CircuitBreaker({
    failureThreshold: overrides.failureThreshold ?? 2,
    resetTimeoutMs: 1000,
    now: () => clock.t,
    ...(overrides.isFailure ? { isFailure: overrides.isFailure } : {}),
  });
  return { breaker, clock };
};

describe('CircuitBreaker', () => {
  it('starts closed and passes calls through', async () => {
    const { breaker } = make();
    expect(breaker.state).toBe('closed');
    await expect(breaker.execute(succeed)).resolves.toBe('ok');
  });

  it('opens after the failure threshold and rejects without calling the function', async () => {
    const { breaker } = make();
    await expect(breaker.execute(fail)).rejects.toThrow('down');
    await expect(breaker.execute(fail)).rejects.toThrow('down');
    expect(breaker.state).toBe('open');

    let called = false;
    await expect(
      breaker.execute(async () => {
        called = true;
      }),
    ).rejects.toBeInstanceOf(CircuitOpenError);
    expect(called).toBe(false);
  });

  it('opens on the first failure when the threshold is 1', async () => {
    const { breaker } = make({ failureThreshold: 1 });
    await expect(breaker.execute(fail)).rejects.toThrow('down');
    expect(breaker.state).toBe('open');
  });

  it('resets the failure count after a success', async () => {
    const { breaker } = make();
    await expect(breaker.execute(fail)).rejects.toThrow('down');
    await breaker.execute(succeed);
    await expect(breaker.execute(fail)).rejects.toThrow('down');
    expect(breaker.state).toBe('closed');
  });

  it('becomes half open after the reset timeout and closes on a successful probe', async () => {
    const { breaker, clock } = make();
    await expect(breaker.execute(fail)).rejects.toThrow('down');
    await expect(breaker.execute(fail)).rejects.toThrow('down');
    clock.t = 1000;
    expect(breaker.state).toBe('half_open');
    await expect(breaker.execute(succeed)).resolves.toBe('ok');
    expect(breaker.state).toBe('closed');
  });

  it('reopens when the probe fails', async () => {
    const { breaker, clock } = make();
    await expect(breaker.execute(fail)).rejects.toThrow('down');
    await expect(breaker.execute(fail)).rejects.toThrow('down');
    clock.t = 1000;
    await expect(breaker.execute(fail)).rejects.toThrow('down');
    expect(breaker.state).toBe('open');
    clock.t = 1500;
    expect(breaker.state).toBe('open');
    clock.t = 2000;
    expect(breaker.state).toBe('half_open');
  });

  it('allows only one probe at a time while half open', async () => {
    const { breaker, clock } = make();
    await expect(breaker.execute(fail)).rejects.toThrow('down');
    await expect(breaker.execute(fail)).rejects.toThrow('down');
    clock.t = 1000;

    let release: (v: string) => void = () => {};
    const slow = () => new Promise<string>((resolve) => (release = resolve));
    const probe = breaker.execute(slow);
    await expect(breaker.execute(succeed)).rejects.toBeInstanceOf(CircuitOpenError);
    release('done');
    await expect(probe).resolves.toBe('done');
    expect(breaker.state).toBe('closed');
  });

  it('does not count errors that isFailure rejects', async () => {
    const { breaker } = make({
      failureThreshold: 1,
      isFailure: (e) => !(e instanceof RangeError),
    });
    await expect(
      breaker.execute(async () => {
        throw new RangeError('not found');
      }),
    ).rejects.toBeInstanceOf(RangeError);
    expect(breaker.state).toBe('closed');
  });
});
