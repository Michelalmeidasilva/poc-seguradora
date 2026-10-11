import './renderers.css';
export function Notice({ tone, text }: { tone: 'info' | 'error'; text: string }) {
  return (
    <div className={`notice notice--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {text}
    </div>
  );
}
