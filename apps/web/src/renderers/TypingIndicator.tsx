import './renderers.css';
export function TypingIndicator() {
  return (
    <div className="bubble bubble--in bubble--tail typing" role="status" aria-label="Digitando">
      <span className="typing__dot" />
      <span className="typing__dot" />
      <span className="typing__dot" />
    </div>
  );
}
