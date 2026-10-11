import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { VoiceMessage } from './VoiceMessage';

describe('VoiceMessage', () => {
  it('shows the duration as m:ss and a play button', () => {
    render(<VoiceMessage id="v1" mediaUrl="https://exemplo.invalid/a.ogg" durationMs={65000} />);
    expect(screen.getByText('1:05')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reproduzir/i })).toBeInTheDocument();
  });

  it('toggles between play and pause', async () => {
    render(<VoiceMessage id="v1" mediaUrl="https://exemplo.invalid/a.ogg" durationMs={3000} />);
    await userEvent.click(screen.getByRole('button', { name: /reproduzir/i }));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /pausar/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /pausar/i }));
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  });

  it('shows the transcript as text when given', () => {
    render(
      <VoiceMessage
        id="v1"
        mediaUrl="https://exemplo.invalid/a.ogg"
        durationMs={3000}
        transcript="olá <b>x</b>"
      />,
    );
    expect(screen.getByText('olá <b>x</b>')).toBeInTheDocument();
  });

  it('marks the message unavailable when the audio cannot be loaded', () => {
    const { container } = render(
      <VoiceMessage id="v1" mediaUrl="https://exemplo.invalid/a.ogg" durationMs={3000} />,
    );
    fireEvent.error(container.querySelector('audio') as HTMLAudioElement);
    expect(screen.getByText(/áudio indisponível/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reproduzir/i })).toBeDisabled();
  });

  it('plays a local blob URL for the user voice messages', () => {
    const { container } = render(
      <VoiceMessage id="v2" mediaUrl="blob:http://localhost/x" durationMs={3000} />,
    );
    expect(container.querySelector('audio')).toHaveAttribute('src', 'blob:http://localhost/x');
  });

  it('never uses an unsafe URL as the audio source', () => {
    const { container } = render(
      <VoiceMessage id="v3" mediaUrl="javascript:alert(1)" durationMs={3000} />,
    );
    expect(container.querySelector('audio')).toBeNull();
    expect(screen.getByRole('button', { name: /reproduzir/i })).toBeDisabled();
  });

  it('draws a stable waveform for a given id', () => {
    const a = render(<VoiceMessage id="same" mediaUrl="https://a.com/x.ogg" durationMs={1000} />);
    const first = a.container.querySelector('.voice__wave')?.innerHTML;
    a.unmount();
    const b = render(<VoiceMessage id="same" mediaUrl="https://a.com/x.ogg" durationMs={1000} />);
    expect(b.container.querySelector('.voice__wave')?.innerHTML).toBe(first);
  });
});
