import { useEffect, useMemo, useState } from 'react';
import type { BotItem, BotMessageEvent } from '../chat/model';
import { Header } from '../chat/Header';
import { demoAudioBlob, DEMO_AUDIO_DURATION_MS } from '../chat/demo-audio';
import { showcaseFlow } from '../flows';
import type { OpenFlow } from '../renderers/flow-host';
import { renderBotMessage } from '../renderers/registry';
import { Notice } from '../renderers/Notice';
import { TypingIndicator } from '../renderers/TypingIndicator';
import { VoiceMessage } from '../renderers/VoiceMessage';
import { Bubble } from '../ui/Bubble';
import './catalog.css';

type Sample = {
  [Type in BotMessageEvent['type']]: {
    title: string;
    type: Type;
    payload: Extract<BotMessageEvent, { type: Type }>['payload'];
  };
}[BotMessageEvent['type']];

export function ComponentCatalog({
  openFlow,
  result,
  onResult,
}: {
  openFlow: OpenFlow;
  result: string;
  onResult(message: string): void;
}) {
  const [audio, setAudio] = useState('');
  useEffect(() => {
    if (typeof URL.createObjectURL !== 'function') return;
    const url = URL.createObjectURL(demoAudioBlob('AUD-01'));
    setAudio(url);
    return () => URL.revokeObjectURL(url);
  }, []);
  const samples = useMemo<Sample[]>(() => {
    const media = (name: string) => new URL(`/catalog/${name}.svg`, window.location.href).href;
    return [
      {
        title: 'Planos e assistências · carrossel',
        type: 'message.carousel',
        payload: {
          cards: [
            {
              mediaUrl: media('house'),
              mediaType: 'image',
              title: 'Assistência residencial',
              body: 'Chaveiro, eletricista e encanador. R$ 19,90/mês · valor ilustrativo.',
              buttons: [
                { type: 'quick_reply', id: 'residencial', title: 'Conhecer plano' },
                { type: 'quick_reply', id: 'detalhes', title: 'Ver detalhes' },
              ],
            },
            {
              mediaUrl: media('health'),
              mediaType: 'image',
              title: 'Assistência saúde',
              body: 'Orientação e cuidado para você e sua família. R$ 24,90/mês · valor ilustrativo.',
              buttons: [{ type: 'quick_reply', id: 'saude', title: 'Conhecer plano' }],
            },
            {
              mediaUrl: media('family'),
              mediaType: 'image',
              title: 'Assistência funeral',
              body: 'Acolhimento e apoio à família. R$ 14,90/mês · valor ilustrativo.',
              buttons: [{ type: 'quick_reply', id: 'funeral', title: 'Conhecer plano' }],
            },
          ],
        },
      },
      {
        title: 'Texto e formatação',
        type: 'message.text',
        payload: {
          text: 'Seu plano está *ativo*. A assistência está disponível _24 horas por dia_.\nVamos cuidar do que importa para você.',
        },
      },
      {
        title: 'Respostas rápidas',
        type: 'message.quick_replies',
        payload: {
          text: 'Qual assistência você procura?',
          options: [
            { id: 'residencial', title: 'Residencial' },
            { id: 'saude', title: 'Saúde' },
            { id: 'funeral', title: 'Funeral' },
          ],
        },
      },
      {
        title: 'Mensagem com ação · template',
        type: 'message.template',
        payload: {
          header: 'Seu pedido está em andamento',
          body: 'Protocolo de exemplo: AS-2026-001. Consulte os próximos passos do atendimento.',
          footer: 'Dados fictícios',
          buttons: [{ type: 'quick_reply', id: 'acompanhar', title: 'Acompanhar pedido' }],
        },
      },
      {
        title: 'Documento demonstrativo',
        type: 'message.document',
        payload: {
          documents: [
            { id: 'condicoes', title: 'Condições do plano.pdf', status: 'available' },
            { id: 'comprovante', title: 'Comprovante de assistência', status: 'generating' },
          ],
        },
      },
      {
        title: 'Protocolo · código',
        type: 'message.code',
        payload: { code: 'AS-2026-001\nStatus: solicitação recebida' },
      },
      {
        title: 'Localização',
        type: 'message.location',
        payload: {
          latitude: -23.5505,
          longitude: -46.6333,
          name: 'Ponto de atendimento de exemplo',
          address: 'São Paulo, SP · localização ilustrativa',
        },
      },
      {
        title: 'Formulário · todos os componentes de Flow',
        type: 'message.flow',
        payload: {
          flowId: 'catalog-components',
          header: 'Solicitar assistência',
          body: 'Experimente títulos, textos, campos, seleções, datas, uploads, imagens, listas e confirmações.',
          ctaLabel: 'Abrir formulário',
          flowJson: showcaseFlow(window.location.origin),
        },
      },
    ];
  }, []);

  return (
    <div className="component-catalog">
      <Header connection="online" typing={false} />
      <div className="component-catalog__scroll">
        <h2>Catálogo</h2>
        <p className="component-catalog__intro">
          Os componentes do atendimento, com exemplos de seguros e assistências. As ações desta área
          são demonstrativas.
        </p>
        <nav className="component-catalog__nav" aria-label="Seções do catálogo">
          <a href="#catalog-plans">Planos</a>
          <a href="#catalog-messages">Mensagens</a>
          <a href="#catalog-media">Mídia</a>
          <a href="#catalog-forms">Formulários</a>
        </nav>
        <div className="component-catalog__grid">
          {samples.map((sample, index) => {
            const item: BotItem = {
              kind: 'bot',
              id: `catalog-${index}`,
              seq: index + 1,
              ts: '2026-10-14T12:41:00Z',
              event: {
                v: 1,
                id: `catalog-${index}`,
                seq: index + 1,
                sessionId: 'catalog',
                correlationId: 'catalog',
                ts: '2026-10-14T12:41:00Z',
                type: sample.type,
                payload: sample.payload,
              } as BotMessageEvent,
            };
            return (
              <section
                className="component-catalog__sample"
                key={sample.title}
                id={
                  index === 0
                    ? 'catalog-plans'
                    : index === 1
                      ? 'catalog-messages'
                      : index === 4
                        ? 'catalog-media'
                        : index === 7
                          ? 'catalog-forms'
                          : undefined
                }
              >
                <h3>{sample.title}</h3>
                {renderBotMessage(item, {
                  interactive: true,
                  sendChoice: (_id, title) => onResult(`Exemplo selecionado: ${title}`),
                  openFlow,
                })}
                {index === 1 ? (
                  <Bubble
                    direction="out"
                    time="9:42"
                    status="delivered"
                    label="Mensagem enviada de exemplo"
                  >
                    Quero consultar as coberturas.
                  </Bubble>
                ) : null}
              </section>
            );
          })}
          <section className="component-catalog__sample">
            <h3>Áudio com transcrição</h3>
            <Bubble direction="in" time="9:43">
              <VoiceMessage
                id="catalog-audio"
                mediaUrl={audio}
                durationMs={DEMO_AUDIO_DURATION_MS}
                transcript="Sua solicitação foi recebida. Acompanhe os próximos passos por aqui."
              />
            </Bubble>
            <p className="component-catalog__intro">Áudio ilustrativo gerado localmente.</p>
          </section>
          <section className="component-catalog__sample">
            <h3>Estados do atendimento</h3>
            <TypingIndicator />
            <Notice tone="info" text="Você pode retomar esta solicitação mais tarde." />
            <Notice tone="error" text="Exemplo de falha. Tente novamente." />
            <div className="component-catalog__states">
              {(['sending', 'sent', 'delivered', 'failed'] as const).map((status) => (
                <Bubble key={status} direction="out" status={status} time="9:44">
                  {
                    {
                      sending: 'Enviando',
                      sent: 'Enviada',
                      delivered: 'Entregue',
                      failed: 'Falha no envio',
                    }[status]
                  }
                </Bubble>
              ))}
            </div>
          </section>
        </div>
      </div>
      <div className="component-catalog__result" role="status" aria-label="Resultado do exemplo">
        {result || 'Dados fictícios. Nenhuma solicitação será enviada nesta área.'}
      </div>
    </div>
  );
}
