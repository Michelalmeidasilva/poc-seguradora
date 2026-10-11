import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVoiceRecorder } from './useVoiceRecorder';

class FakeRecorder {
  static instances: FakeRecorder[] = [];
  state: 'inactive' | 'recording' = 'inactive';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(public stream: MediaStream) {
    FakeRecorder.instances.push(this);
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['audio'], { type: 'audio/webm' }) });
    this.onstop?.();
  }
}

const track = { stop: vi.fn() };
const stream = { getTracks: () => [track] } as unknown as MediaStream;

beforeEach(() => {
  vi.useFakeTimers();
  FakeRecorder.instances = [];
  track.stop.mockClear();
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn(async () => stream) },
    configurable: true,
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useVoiceRecorder', () => {
  it('records, counts the elapsed time and returns the audio on stop', async () => {
    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.status).toBe('recording');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(result.current.elapsedMs).toBeGreaterThanOrEqual(2000);
    let recording: Awaited<ReturnType<typeof result.current.stop>>;
    await act(async () => {
      recording = await result.current.stop();
    });
    expect(recording!.blob.size).toBeGreaterThan(0);
    expect(recording!.durationMs).toBeGreaterThanOrEqual(2000);
    expect(result.current.status).toBe('idle');
    expect(track.stop).toHaveBeenCalled();
  });

  it('cancels without returning audio and releases the microphone', async () => {
    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.start();
    });
    act(() => result.current.cancel());
    expect(result.current.status).toBe('idle');
    expect(track.stop).toHaveBeenCalled();
  });

  it('reports an error when the permission is denied', async () => {
    (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('denied'),
    );
    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.status).toBe('error');
  });

  it('reports an error when recording is not supported', async () => {
    vi.stubGlobal('MediaRecorder', undefined);
    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.status).toBe('error');
  });

  it('stops the recording automatically at the maximum duration', async () => {
    const { result } = renderHook(() => useVoiceRecorder({ maxMs: 5000 }));
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5200);
    });
    expect(FakeRecorder.instances[0]?.state).toBe('inactive');
  });

  it('returns nothing when stop is called without a recording', async () => {
    const { result } = renderHook(() => useVoiceRecorder());
    let out: unknown = 'x';
    await act(async () => {
      out = await result.current.stop();
    });
    expect(out).toBeUndefined();
  });
});
