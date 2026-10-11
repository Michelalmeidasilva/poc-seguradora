import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Composer } from './Composer';

const noop = () => undefined;
const recorder = (over = {}) => ({
  status: 'idle' as const,
  elapsedMs: 0,
  start: vi.fn(async () => undefined),
  stop: vi.fn(async () => ({ blob: new Blob(['x']), durationMs: 2500 })),
  cancel: vi.fn(),
  ...over,
});

describe('Composer', () => {
  it('shows the microphone when empty and the send button when there is text', async () => {
    render(<Composer onSendText={noop} onSendVoice={noop} recorder={recorder()} />);
    expect(screen.getByRole('button', { name: /gravar áudio/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^enviar$/i })).toBeNull();
    await userEvent.type(screen.getByRole('textbox', { name: /mensagem/i }), 'oi');
    expect(screen.getByRole('button', { name: /^enviar$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /gravar áudio/i })).toBeNull();
  });

  it('sends on Enter, clears the field and keeps the focus', async () => {
    const onSendText = vi.fn();
    render(<Composer onSendText={onSendText} onSendVoice={noop} recorder={recorder()} />);
    const input = screen.getByRole('textbox', { name: /mensagem/i });
    await userEvent.type(input, 'olá{Enter}');
    expect(onSendText).toHaveBeenCalledWith('olá');
    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
  });

  it('inserts a line break on Shift+Enter without sending', async () => {
    const onSendText = vi.fn();
    render(<Composer onSendText={onSendText} onSendVoice={noop} recorder={recorder()} />);
    const input = screen.getByRole('textbox', { name: /mensagem/i });
    await userEvent.type(input, 'a{Shift>}{Enter}{/Shift}b');
    expect(onSendText).not.toHaveBeenCalled();
    expect(input).toHaveValue('a\nb');
  });

  it('does not send blank text', async () => {
    const onSendText = vi.fn();
    render(<Composer onSendText={onSendText} onSendVoice={noop} recorder={recorder()} />);
    await userEvent.type(screen.getByRole('textbox', { name: /mensagem/i }), '   {Enter}');
    expect(onSendText).not.toHaveBeenCalled();
  });

  it('limits the text to the protocol maximum', async () => {
    render(<Composer onSendText={noop} onSendVoice={noop} recorder={recorder()} />);
    expect(screen.getByRole('textbox', { name: /mensagem/i })).toHaveAttribute('maxlength', '4096');
  });

  it('starts recording when the microphone is pressed', async () => {
    const r = recorder();
    render(<Composer onSendText={noop} onSendVoice={noop} recorder={r} />);
    await userEvent.click(screen.getByRole('button', { name: /gravar áudio/i }));
    expect(r.start).toHaveBeenCalled();
  });

  it('shows the elapsed time while recording and sends the audio on stop', async () => {
    const r = recorder({ status: 'recording', elapsedMs: 3500 });
    const onSendVoice = vi.fn();
    render(<Composer onSendText={noop} onSendVoice={onSendVoice} recorder={r} />);
    expect(screen.getByText('0:03')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /enviar áudio/i }));
    expect(r.stop).toHaveBeenCalled();
    expect(onSendVoice).toHaveBeenCalledWith(expect.any(Blob), 2500);
  });

  it('cancels a recording', async () => {
    const r = recorder({ status: 'recording', elapsedMs: 1000 });
    render(<Composer onSendText={noop} onSendVoice={noop} recorder={r} />);
    await userEvent.click(screen.getByRole('button', { name: /cancelar gravação/i }));
    expect(r.cancel).toHaveBeenCalled();
  });

  it('tells the user when the microphone is not available', () => {
    render(
      <Composer onSendText={noop} onSendVoice={noop} recorder={recorder({ status: 'error' })} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/microfone/i);
  });

  it('disables the field when disabled', () => {
    render(<Composer onSendText={noop} onSendVoice={noop} recorder={recorder()} disabled />);
    expect(screen.getByRole('textbox', { name: /mensagem/i })).toBeDisabled();
  });

  it('does not send on Enter while an IME composition is in progress', async () => {
    const onSendText = vi.fn();
    render(<Composer onSendText={onSendText} onSendVoice={noop} recorder={recorder()} />);
    const input = screen.getByRole('textbox', { name: /mensagem/i });
    await userEvent.type(input, 'に');
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(onSendText).not.toHaveBeenCalled();
  });

  it('returns the focus to the field after cancelling a recording', async () => {
    const r = recorder({ status: 'recording', elapsedMs: 1000 });
    const { rerender } = render(<Composer onSendText={noop} onSendVoice={noop} recorder={r} />);
    await userEvent.click(screen.getByRole('button', { name: /cancelar gravação/i }));
    rerender(<Composer onSendText={noop} onSendVoice={noop} recorder={recorder()} />);
    expect(screen.getByRole('textbox', { name: /mensagem/i })).toHaveFocus();
  });

  it('returns the focus to the field after sending the audio', async () => {
    const r = recorder({ status: 'recording', elapsedMs: 1000 });
    const { rerender } = render(<Composer onSendText={noop} onSendVoice={noop} recorder={r} />);
    await userEvent.click(screen.getByRole('button', { name: /enviar áudio/i }));
    rerender(<Composer onSendText={noop} onSendVoice={noop} recorder={recorder()} />);
    expect(screen.getByRole('textbox', { name: /mensagem/i })).toHaveFocus();
  });
});
