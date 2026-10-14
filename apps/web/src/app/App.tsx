import { useCallback, useEffect, useRef, useState } from 'react';
import '../ui/base.css';
import { ChatScreen } from '../chat/ChatScreen';
import { useChat } from '../chat/useChat';
import { FlowSheet } from '../flows';
import type { OpenFlowRequest } from '../renderers/flow-host';
import { ExperienceShell } from './ExperienceShell';
import { ComponentCatalog } from './ComponentCatalog';

export function App() {
  const chat = useChat();
  // `key` changes on every open, so reopening the same Flow starts it over.
  const [flow, setFlow] = useState<
    { request: OpenFlowRequest; key: number; demo: boolean } | undefined
  >();
  const [catalogResult, setCatalogResult] = useState('');
  const opens = useRef(0);
  const flowOpener = useRef<HTMLElement | null>(null);
  const hadFlow = useRef(false);
  const greetedSession = useRef<string | undefined>(undefined);
  const passive = chat.tab === 'other-tab';

  useEffect(() => {
    document.title = 'Digio Assistências';
  }, []);

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
      flowOpener.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      opens.current += 1;
      setFlow({ request, key: opens.current, demo: false });
    },
    [passive],
  );
  const closeFlow = useCallback(() => setFlow(undefined), []);
  const openCatalogFlow = useCallback((request: OpenFlowRequest) => {
    flowOpener.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    opens.current += 1;
    setFlow({ request, key: opens.current, demo: true });
  }, []);

  // Restore after React removes inert, rather than during the sheet's layout cleanup.
  useEffect(() => {
    if (!flow && hadFlow.current) {
      if (flowOpener.current?.isConnected) flowOpener.current.focus();
      flowOpener.current = null;
    }
    hadFlow.current = Boolean(flow);
  }, [flow]);

  // Demoted to a passive tab: drop the open Flow without submitting.
  useEffect(() => {
    if (passive) setFlow((current) => (current?.demo ? current : undefined));
  }, [passive]);

  return (
    <ExperienceShell
      conversation={<ChatScreen chat={chat} openFlow={openFlow} />}
      catalog={
        <ComponentCatalog
          openFlow={openCatalogFlow}
          result={catalogResult}
          onResult={setCatalogResult}
        />
      }
      overlay={
        flow && (flow.demo || !passive) ? (
          <FlowSheet
            key={flow.key}
            request={flow.request}
            onClose={closeFlow}
            submit={
              flow.demo
                ? () => setCatalogResult('Exemplo concluído. Nenhuma solicitação foi enviada.')
                : chat.sendFlowSubmit
            }
            exchange={flow.demo ? () => undefined : chat.sendFlowDataExchange}
          />
        ) : null
      }
    />
  );
}
