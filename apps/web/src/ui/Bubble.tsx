import type { ReactNode } from 'react';
import type { OutStatus } from './bubble-types';
import './bubble.css';
import { AlertIcon, CheckIcon, ClockIcon, DoubleCheckIcon } from './icons';

export interface BubbleProps {
  direction: 'in' | 'out';
  time: string;
  status?: OutStatus;
  tail?: boolean;
  label?: string;
  children: ReactNode;
}

const STATUS_LABEL: Record<OutStatus, string> = {
  sending: 'Enviando',
  sent: 'Enviada',
  delivered: 'Entregue',
  failed: 'Falha no envio',
};

function StatusTicks({ status }: { status: OutStatus }) {
  const title = STATUS_LABEL[status];
  switch (status) {
    case 'sending':
      return <ClockIcon title={title} className="tick tick--pending" />;
    case 'sent':
      return <CheckIcon title={title} className="tick" />;
    case 'delivered':
      return <DoubleCheckIcon title={title} className="tick tick--delivered" />;
    case 'failed':
      return <AlertIcon title={title} className="tick tick--failed" />;
  }
}

export function Bubble({ direction, time, status, tail = true, label, children }: BubbleProps) {
  const classes = ['bubble', `bubble--${direction}`, tail ? 'bubble--tail' : ''].filter(Boolean);
  return (
    <div className={classes.join(' ')} role="group" {...(label ? { 'aria-label': label } : {})}>
      <div className="bubble__content">{children}</div>
      <span className="bubble__meta">
        <time>{time}</time>
        {direction === 'out' && status ? <StatusTicks status={status} /> : null}
      </span>
    </div>
  );
}
