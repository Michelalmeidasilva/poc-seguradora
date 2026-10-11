import { useCallback, useEffect, useRef, useState } from 'react';

export type RecorderStatus = 'idle' | 'recording' | 'error';
export interface Recording {
  blob: Blob;
  durationMs: number;
}
export interface VoiceRecorder {
  status: RecorderStatus;
  elapsedMs: number;
  start(): Promise<void>;
  stop(): Promise<Recording | undefined>;
  cancel(): void;
}

export function useVoiceRecorder(options: { maxMs?: number } = {}): VoiceRecorder {
  const maxMs = options.maxMs ?? 120_000;
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const recorder = useRef<MediaRecorder | undefined>(undefined);
  const stream = useRef<MediaStream | undefined>(undefined);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const ticker = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const resolveStop = useRef<((r: Recording | undefined) => void) | undefined>(undefined);
  const discard = useRef(false);

  const release = useCallback(() => {
    clearInterval(ticker.current);
    ticker.current = undefined;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = undefined;
    recorder.current = undefined;
  }, []);

  const finish = useCallback(() => {
    const durationMs = Date.now() - startedAt.current;
    const blob = new Blob(chunks.current, { type: chunks.current[0]?.type || 'audio/webm' });
    release();
    setStatus('idle');
    setElapsedMs(0);
    const resolve = resolveStop.current;
    resolveStop.current = undefined;
    resolve?.(discard.current || blob.size === 0 ? undefined : { blob, durationMs });
  }, [release]);

  const start = useCallback(async () => {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setStatus('error');
      return;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = media;
      chunks.current = [];
      discard.current = false;
      const rec = new MediaRecorder(media);
      recorder.current = rec;
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };
      rec.onstop = finish;
      startedAt.current = Date.now();
      rec.start();
      setStatus('recording');
      setElapsedMs(0);
      ticker.current = setInterval(() => {
        const elapsed = Date.now() - startedAt.current;
        setElapsedMs(elapsed);
        if (elapsed >= maxMs) rec.stop();
      }, 250);
    } catch {
      release();
      setStatus('error');
    }
  }, [finish, maxMs, release]);

  const stop = useCallback(
    () =>
      new Promise<Recording | undefined>((resolve) => {
        const rec = recorder.current;
        if (rec?.state !== 'recording') return resolve(undefined);
        resolveStop.current = resolve;
        rec.stop();
      }),
    [],
  );

  const cancel = useCallback(() => {
    discard.current = true;
    const rec = recorder.current;
    if (rec?.state === 'recording') rec.stop();
    else release();
    setStatus('idle');
    setElapsedMs(0);
  }, [release]);

  useEffect(() => () => release(), [release]);

  return { status, elapsedMs, start, stop, cancel };
}
