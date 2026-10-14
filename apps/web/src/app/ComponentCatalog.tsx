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
        title: 'Seguros · carrossel',
        type: 'message.carousel',
        payload: {
          cards: [
            {
              mediaUrl: media('family'),
              mediaType: 'image',
              title: 'Assistência Funeral',
              body: 'Acolhimento e apoio à família. Conheça os planos e benefícios.',
              buttons: [
                { type: 'quick_reply', id: 'funeral', title: 'Conhecer plano' },
                { type: 'quick_reply', id: 'detalhes', title: 'Ver detalhes' },
              ],
            },
            {
              mediaUrl: media('pharmacy'),
              mediaType: 'image',
              title: 'Assistência Farmácia',
              body: 'Descontos em medicamentos nas redes credenciadas.',
              buttons: [{ type: 'quick_reply', id: 'farmacia', title: 'Conhecer plano' }],
            },
            {
              mediaUrl: media('health'),
              mediaType: 'image',
              title: 'Telemedicina',
              body: 'Atendimento médico a distância, com praticidade para você.',
              buttons: [{ type: 'quick_reply', id: 'telemedicina', title: 'Conhecer plano' }],
            },
          ],
        },
      },
      {
        title: 'Texto e formatação',
        type: 'message.text',
        payload: {
          text: 'Seu plano está *ativo*. Consulte os serviços disponíveis para _você e sua família_.\nVamos cuidar do que importa para você.',
        },
      },
      {
        title: 'Respostas rápidas',
        type: 'message.quick_replies',
        payload: {
          text: 'Qual serviço você procura?',
          options: [
            { id: 'funeral', title: 'Assistência Funeral' },
            { id: 'farmacia', title: 'Assistência Farmácia' },
            { id: 'telemedicina', title: 'Telemedicina' },
          ],
        },
      },
      {
        title: 'Mensagem com ação · template',
        type: 'message.template',
        payload: {
          header: 'Seu pedido está em andamento',
          body: 'Protocolo: AS-2026-001. Consulte os próximos passos do atendimento.',
          footer: 'DIGIO Care',
          buttons: [{ type: 'quick_reply', id: 'acompanhar', title: 'Acompanhar pedido' }],
        },
      },
      {
        title: 'Documento do plano',
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
          name: 'Ponto de atendimento',
          address: 'São Paulo, SP',
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
          Conheça os seguros da DIGIO Care e escolha o serviço que deseja explorar.
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
                  sendChoice: (_id, title) => onResult(`Opção selecionada: ${title}`),
                  openFlow,
                })}
                {index === 1 ? (
                  <Bubble direction="out" time="9:42" status="delivered" label="Mensagem enviada">
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
            <p className="component-catalog__intro">Ouça a mensagem e acompanhe a transcrição.</p>
          </section>
          <section className="component-catalog__sample">
            <h3>Estados do atendimento</h3>
            <TypingIndicator />
            <Notice tone="info" text="Você pode retomar esta solicitação mais tarde." />
            <Notice tone="error" text="Não foi possível continuar. Tente novamente." />
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
      <div className="component-catalog__result" role="status" aria-label="Resultado da seleção">
        {result || 'Escolha um serviço para conhecer as opções.'}
      </div>
    </div>
  );
}
