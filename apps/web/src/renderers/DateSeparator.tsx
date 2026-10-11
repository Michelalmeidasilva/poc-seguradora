import './renderers.css';
export function DateSeparator({ label }: { label: string }) {
  return (
    <div className="date-separator">
      <span>{label}</span>
    </div>
  );
}
