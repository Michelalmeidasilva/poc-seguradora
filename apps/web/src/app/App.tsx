import { useLayoutEffect, useState } from 'react';
import '../ui/base.css';
import { ChatScreen } from '../chat/ChatScreen';
import { useChat } from '../chat/useChat';
import type { OpenFlowRequest } from '../renderers/flow-host';
import { FlowPlaceholder } from '../renderers/FlowPlaceholder';

function applyThemeFromUrl(): void {
  const theme = new URLSearchParams(window.location.search).get('theme');
  if (theme === 'dark' || theme === 'light') document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

export function App() {
  const chat = useChat();
  const [flow, setFlow] = useState<OpenFlowRequest | undefined>();

  useLayoutEffect(applyThemeFromUrl, []);

  return (
    <>
      <ChatScreen chat={chat} openFlow={setFlow} />
      {flow ? <FlowPlaceholder request={flow} onClose={() => setFlow(undefined)} /> : null}
    </>
  );
}
