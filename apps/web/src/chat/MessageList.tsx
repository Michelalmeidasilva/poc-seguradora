import { Fragment, useEffect, useRef, type ReactNode } from 'react';
import { DateSeparator } from '../renderers/DateSeparator';
import type { OpenFlow } from '../renderers/flow-host';
import { Notice } from '../renderers/Notice';
import { renderBotMessage } from '../renderers/registry';
import { TypingIndicator } from '../renderers/TypingIndicator';
import { VoiceMessage } from '../renderers/VoiceMessage';
import { Bubble } from '../ui/Bubble';
import { formatDay, formatTime, sameDay } from '../ui/time';
import { isInteractive, type ChatItem, type ChatState, type UserItem } from './model';

const assistanceOptionsFollow = (text: ChatItem | undefined, options: ChatItem | undefined) =>
  text?.kind === 'bot' &&
  text.event.type === 'message.text' &&
  options?.kind === 'bot' &&
  options.event.type === 'message.quick_replies' &&
  options.event.payload.text === 'Escolha uma opção para continuar.' &&
  text.event.correlationId === options.event.correlationId;

export interface MessageListProps {
  state: ChatState;
  sendChoice(optionId: string, title: string, replyToId: string): void;
  openFlow: OpenFlow;
  resend(id: string): void;
  canResend(id: string): boolean;
  now?: Date;
  timeZone?: string;
}

function UserContent({ item }: { item: UserItem }) {
  const c = item.content;
  switch (c.type) {
    case 'text':
      return <>{c.text}</>;
    case 'quick_reply':
      return <>{c.title}</>;
    case 'flow_submit':
      return <>{c.summary}</>;
    case 'voice':
      return <VoiceMessage id={item.id} mediaUrl={c.objectUrl ?? ''} durationMs={c.durationMs} />;
  }
}

export function MessageList({
  state,
  sendChoice,
  openFlow,
  resend,
  canResend,
  now,
  timeZone,
}: MessageListProps) {
  const bottom = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (stick.current) bottom.current?.scrollIntoView?.({ block: 'end' });
  }, [state.items.length, state.typing]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const today = now ?? new Date();

  return (
    <div className="messages" ref={scroller} onScroll={onScroll}>
      <div
        className="messages__log"
        role="log"
        aria-label="Conversa"
        aria-live="polite"
        aria-relevant="additions"
      >
        {state.items.map((item, index) => {
          const previous = state.items[index - 1];
          const separator =
            !previous || !sameDay(previous.ts, item.ts, timeZone) ? (
              <DateSeparator label={formatDay(item.ts, today, 'pt-BR', timeZone)} />
            ) : null;
          if (assistanceOptionsFollow(item, state.items[index + 1])) {
            return <Fragment key={item.id}>{separator}</Fragment>;
          }
          const combinedText =
            assistanceOptionsFollow(previous, item) &&
            previous?.kind === 'bot' &&
            previous.event.type === 'message.text'
              ? previous.event.payload.text
              : undefined;

          let body: ReactNode;
          if (item.kind === 'bot') {
            body = renderBotMessage(item, {
              interactive: isInteractive(state, item.id),
              sendChoice,
              openFlow,
              textOverride: combinedText,
            });
          } else if (item.kind === 'notice') {
            body = <Notice tone={item.tone} text={item.text} />;
          } else {
            body = (
              <>
                <Bubble
                  direction="out"
                  time={formatTime(item.ts, 'pt-BR', timeZone)}
                  status={item.status}
                  label="Sua mensagem"
                >
                  <UserContent item={item} />
                </Bubble>
                {item.status === 'failed' && canResend(item.id) ? (
                  <button type="button" className="retry" onClick={() => resend(item.id)}>
                    Tentar de novo
                  </button>
                ) : null}
              </>
            );
          }
          return (
            <Fragment key={item.id}>
              {separator}
              {body}
            </Fragment>
          );
        })}
        {state.typing ? <TypingIndicator /> : null}
        <div ref={bottom} />
      </div>
    </div>
  );
}
