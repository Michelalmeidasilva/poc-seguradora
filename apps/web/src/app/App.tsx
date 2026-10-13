import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import '../ui/base.css';
import { ChatScreen } from '../chat/ChatScreen';
import { useChat } from '../chat/useChat';
import { FlowSheet } from '../flows';
import type { OpenFlowRequest } from '../renderers/flow-host';

function applyThemeFromUrl(): void {
  const theme = new URLSearchParams(window.location.search).get('theme');
  if (theme === 'dark' || theme === 'light') document.documentElement.dataset.theme = theme;
  else document.documentElement.dataset.theme = 'dark';
  document.title = 'Digio Assistências';
}

export function App() {
  const chat = useChat();
  // `key` changes on every open, so reopening the same Flow starts it over.
  const [flow, setFlow] = useState<{ request: OpenFlowRequest; key: number } | undefined>();
  const opens = useRef(0);
  const greetedSession = useRef<string | undefined>(undefined);
  const passive = chat.tab === 'other-tab';

  useLayoutEffect(applyThemeFromUrl, []);

  useEffect(() => {
    const session = chat.state.sessionId ?? 'initial';
    const lastBot = [...chat.state.items].reverse().find((item) => item.kind === 'bot');
    const obsoleteMenu =
      chat.state.lastSeq === 0 &&
      lastBot?.kind === 'bot' &&
      lastBot.event.type === 'message.quick_replies' &&
      lastBot.event.payload.options.some((option) => option.id === 'menu.quote');
    const resetSession =
      chat.state.lastSeq === 0 &&
      chat.state.items.some((item) => item.kind === 'notice' && item.id.startsWith('reset-'));
    if (
      passive ||
      chat.hasPendingSend ||
      chat.state.connection !== 'online' ||
      (chat.state.items.length > 0 && !obsoleteMenu && !resetSession) ||
      greetedSession.current === session
    )
      return;
    greetedSession.current = session;
    chat.sendText('Oi');
  }, [chat, passive]);

  const openFlow = useCallback(
    (request: OpenFlowRequest) => {
      if (passive) return;
      opens.current += 1;
      setFlow({ request, key: opens.current });
    },
    [passive],
  );
  const closeFlow = useCallback(() => setFlow(undefined), []);

  // Demoted to a passive tab: drop the open Flow without submitting.
  useEffect(() => {
    if (passive) setFlow(undefined);
  }, [passive]);

  return (
    <>
      <ChatScreen chat={chat} openFlow={openFlow} />
      {flow && !passive ? (
        <FlowSheet
          key={flow.key}
          request={flow.request}
          onClose={closeFlow}
          submit={chat.sendFlowSubmit}
          exchange={chat.sendFlowDataExchange}
        />
      ) : null}
    </>
  );
}
