import './chat.css';
import type { OpenFlow } from '../renderers/flow-host';
import { Composer } from './Composer';
import { Header } from './Header';
import { MessageList } from './MessageList';
import type { ChatApi } from './useChat';
import { useVoiceRecorder } from './useVoiceRecorder';

export interface ChatScreenProps {
  chat: ChatApi;
  openFlow?: OpenFlow;
}

const ignoreFlow: OpenFlow = () => undefined;

export function ChatScreen({ chat, openFlow = ignoreFlow }: ChatScreenProps) {
  const recorder = useVoiceRecorder();
  const { state } = chat;

  return (
    <div className="chat">
      <Header connection={state.connection} typing={state.typing} />
      <MessageList
        state={state}
        sendChoice={chat.sendChoice}
        openFlow={openFlow}
        resend={chat.resend}
      />
      {chat.tab === 'other-tab' ? (
        <div className="chat__other-tab" role="status">
          <span>A conversa está aberta em outra aba.</span>
          <button type="button" onClick={chat.takeOver}>
            Usar esta aba
          </button>
        </div>
      ) : (
        <Composer onSendText={chat.sendText} onSendVoice={chat.sendVoice} recorder={recorder} />
      )}
    </div>
  );
}
