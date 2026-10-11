import { useRef, useState } from 'react';
import { PauseIcon, PlayIcon } from '../ui/icons';
import './renderers.css';
import { safeMediaUrl } from './safe-urls';

const BARS = 28;

function waveform(id: string): { key: string; height: number }[] {
  let seed = 0;
  for (const ch of id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  return Array.from({ length: BARS }, (_, position) => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return { key: `bar-${position}`, height: 20 + (seed % 80) };
  });
}

const formatDuration = (ms: number): string => {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

export interface VoiceMessageProps {
  id: string;
  mediaUrl: string;
  durationMs: number;
  transcript?: string | undefined;
}

export function VoiceMessage({ id, mediaUrl, durationMs, transcript }: VoiceMessageProps) {
  const src = safeMediaUrl(mediaUrl);
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [broken, setBroken] = useState(false);
  const unavailable = !src || broken;

  const toggle = () => {
    const el = audio.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      void el.play();
      setPlaying(true);
    }
  };

  return (
    <div className="voice">
      <button
        type="button"
        className="voice__button"
        aria-label={playing ? 'Pausar áudio' : 'Reproduzir áudio'}
        disabled={unavailable}
        onClick={toggle}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <div className="voice__wave" aria-hidden="true">
        {waveform(id).map((bar) => (
          <span key={bar.key} style={{ height: `${bar.height}%` }} />
        ))}
      </div>
      <span className="voice__duration">{formatDuration(durationMs)}</span>
      {unavailable ? <span className="voice__error">Áudio indisponível</span> : null}
      {src ? (
        <audio
          ref={audio}
          src={src}
          preload="none"
          onEnded={() => setPlaying(false)}
          onError={() => setBroken(true)}
        />
      ) : null}
      {transcript ? <p className="voice__transcript">{transcript}</p> : null}
    </div>
  );
}
