import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { LIMITS } from '@seguradora/protocol';
import { CloseIcon, MicIcon, SendIcon, StopIcon } from '../ui/icons';
import type { VoiceRecorder } from './useVoiceRecorder';

export interface ComposerProps {
  onSendText(text: string): void;
  onSendVoice(blob: Blob, durationMs: number): void;
  recorder: VoiceRecorder;
  disabled?: boolean;
}

const formatElapsed = (ms: number): string => {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

export function Composer({ onSendText, onSendVoice, recorder, disabled = false }: ComposerProps) {
  const [text, setText] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);

  const previousStatus = useRef(recorder.status);
  useEffect(() => {
    // Focus returns to the field whenever a recording ends (cancelled, sent or auto-stopped).
    if (previousStatus.current === 'recording' && recorder.status !== 'recording') {
      input.current?.focus();
    }
    previousStatus.current = recorder.status;
  }, [recorder.status]);

  const send = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSendText(trimmed);
    setText('');
    input.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  const sendRecording = async () => {
    const recording = await recorder.stop();
    if (recording) onSendVoice(recording.blob, recording.durationMs);
  };

  if (recorder.status === 'recording') {
    return (
      <form className="composer composer--recording" onSubmit={(e) => e.preventDefault()}>
        <button
          type="button"
          className="composer__icon"
          aria-label="Cancelar gravação"
          onClick={recorder.cancel}
        >
          <CloseIcon />
        </button>
        <span className="composer__timer" role="timer">
          {formatElapsed(recorder.elapsedMs)}
        </span>
        <button
          type="button"
          className="composer__action"
          aria-label="Enviar áudio"
          onClick={() => void sendRecording()}
        >
          <StopIcon />
        </button>
      </form>
    );
  }

  return (
    <form className="composer" onSubmit={(e) => e.preventDefault()}>
      {recorder.status === 'error' ? (
        <p className="composer__error" role="alert">
          Não foi possível acessar o microfone.
        </p>
      ) : null}
      <textarea
        ref={input}
        className="composer__input"
        aria-label="Mensagem"
        placeholder="Digite uma mensagem"
        rows={1}
        maxLength={LIMITS.maxTextLength}
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
      />
      {text.trim() ? (
        <button
          type="button"
          className="composer__action"
          aria-label="Enviar"
          disabled={disabled}
          onClick={send}
        >
          <SendIcon />
        </button>
      ) : (
        <button
          type="button"
          className="composer__action"
          aria-label="Gravar áudio"
          disabled={disabled}
          onClick={() => void recorder.start()}
        >
          <MicIcon />
        </button>
      )}
    </form>
  );
}
