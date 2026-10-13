/** Local, deterministic demonstration scenarios; only these media IDs are accepted by the chatbot. */
export const demoAudio = [
  { id: 'AUD-01', label: 'Pedido compreendido', outcome: 'complete', frequency: 440 },
  { id: 'AUD-03', label: 'Pedido parcialmente compreendido', outcome: 'partial', frequency: 392 },
  { id: 'AUD-04', label: 'Áudio não compreendido', outcome: 'failure', frequency: 330 },
  { id: 'AUD-05', label: 'Dados para revisão', outcome: 'complete', frequency: 523 },
] as const;

export type DemoAudioId = (typeof demoAudio)[number]['id'];
export const DEMO_AUDIO_DURATION_MS = 1800;

/** A short audible local tone stands in for fictitious speech; no capture, upload or fetch occurs. */
export function demoAudioBlob(id: DemoAudioId): Blob {
  const scenario = demoAudio.find((item) => item.id === id)!;
  const sampleRate = 8000;
  const samples = sampleRate * DEMO_AUDIO_DURATION_MS / 1000;
  const bytes = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(bytes);
  const ascii = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  ascii(0, 'RIFF'); view.setUint32(4, 36 + samples * 2, true); ascii(8, 'WAVE');
  ascii(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true);
  view.setUint16(34, 16, true); ascii(36, 'data'); view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) {
    const envelope = Math.min(1, i / 240, (samples - i) / 240);
    const tone = Math.sin(2 * Math.PI * scenario.frequency * i / sampleRate);
    view.setInt16(44 + i * 2, Math.round(tone * envelope * 4800), true);
  }
  return new Blob([bytes], { type: 'audio/wav' });
}
