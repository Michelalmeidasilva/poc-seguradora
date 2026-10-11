import type { ReactNode } from 'react';
import type { BotItem } from '../chat/model';
import { Bubble } from '../ui/Bubble';
import { formatTime } from '../ui/time';
import { CarouselMessage } from './CarouselMessage';
import { CodeMessage } from './CodeMessage';
import type { OpenFlow } from './flow-host';
import { FlowMessage } from './FlowMessage';
import { LocationMessage } from './LocationMessage';
import { QuickReplies } from './QuickReplies';
import { safeHttpUrl } from './safe-urls';
import { TemplateMessage } from './TemplateMessage';
import { FormattedText } from './TextMessage';
import { VoiceMessage } from './VoiceMessage';

export interface RenderContext {
  /** True while this is the last bot message and the user has not answered yet. */
  interactive: boolean;
  sendChoice(optionId: string, title: string, replyToId: string): void;
  openFlow: OpenFlow;
}

/** Maps one server message event to its component (exhaustive over `message.*`). */
export function renderBotMessage(item: BotItem, ctx: RenderContext): ReactNode {
  const event = item.event;
  const time = formatTime(item.ts);
  const onChoice = (optionId: string, title: string) => ctx.sendChoice(optionId, title, item.id);
  const bubble = (content: ReactNode, label = 'Mensagem do assistente') => (
    <Bubble key={item.id} direction="in" time={time} label={label}>
      {content}
    </Bubble>
  );

  switch (event.type) {
    case 'message.text':
      return bubble(<FormattedText text={event.payload.text} />);
    case 'message.code':
      return bubble(
        <CodeMessage
          code={event.payload.code}
          {...(event.payload.language ? { language: event.payload.language } : {})}
        />,
      );
    case 'message.location':
      return bubble(
        <LocationMessage
          latitude={event.payload.latitude}
          longitude={event.payload.longitude}
          name={event.payload.name}
          address={event.payload.address}
        />,
        'Localização enviada pelo assistente',
      );
    case 'message.voice':
      return bubble(
        <VoiceMessage
          id={item.id}
          mediaUrl={safeHttpUrl(event.payload.mediaUrl) ?? ''}
          durationMs={event.payload.durationMs}
          transcript={event.payload.transcript}
        />,
        'Mensagem de voz do assistente',
      );
    case 'message.template':
      return bubble(
        <TemplateMessage
          payload={event.payload}
          interactive={ctx.interactive}
          onChoice={onChoice}
        />,
      );
    case 'message.quick_replies':
      return bubble(
        <QuickReplies
          text={event.payload.text}
          options={event.payload.options}
          interactive={ctx.interactive}
          onChoice={onChoice}
        />,
      );
    case 'message.carousel':
      return (
        <div key={item.id} className="carousel-row">
          <CarouselMessage
            cards={event.payload.cards}
            interactive={ctx.interactive}
            onChoice={onChoice}
          />
        </div>
      );
    case 'message.flow':
      return bubble(
        <FlowMessage payload={event.payload} onOpen={ctx.openFlow} />,
        'Formulário do assistente',
      );
  }
}
