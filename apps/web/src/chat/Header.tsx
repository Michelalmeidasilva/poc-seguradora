import type { Connection } from './model';

const STATUS: Record<Connection, string> = {
  connecting: 'conectando…',
  online: 'online',
  reconnecting: 'reconectando…',
  offline: 'sem conexão',
};

export function Header({ connection, typing }: { connection: Connection; typing: boolean }) {
  return (
    <header className="chat-header">
      <div className="chat-header__avatar" aria-hidden="true">
        d
      </div>
      <div className="chat-header__text">
        <h1 className="chat-header__title">Digio Assistências</h1>
        <span className="chat-header__status">
          Conta comercial · {typing ? 'digitando…' : STATUS[connection]}
        </span>
      </div>
    </header>
  );
}
