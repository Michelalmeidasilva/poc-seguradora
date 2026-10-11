import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import '../ui/base.css';
import { ChatScreen } from '../chat/ChatScreen';
import { useChat } from '../chat/useChat';
import { FlowSheet } from '../flows';
import type { OpenFlowRequest } from '../renderers/flow-host';

function applyThemeFromUrl(): void {
  const theme = new URLSearchParams(window.location.search).get('theme');
  if (theme === 'dark' || theme === 'light') document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

export function App() {
  const chat = useChat();
  // `key` changes on every open, so reopening the same Flow starts it over.
  const [flow, setFlow] = useState<{ request: OpenFlowRequest; key: number } | undefined>();
  const opens = useRef(0);
  const passive = chat.tab === 'other-tab';

  useLayoutEffect(applyThemeFromUrl, []);

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
