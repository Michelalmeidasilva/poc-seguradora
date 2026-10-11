# Workboard

Última atualização: 2026-10-11

Fonte única de quem desenvolve o quê. Protocolo completo: seção 15.3 do spec (`docs/superpowers/specs/2026-10-10-whatsapp-chatbot-poc-design.md`) e skill `workboard-protocol`.

| Workstream | Caminho | Status | Dono | Branch | Iniciado | Atualizado | Notas |
|---|---|---|---|---|---|---|---|
| protocol | packages/protocol | done | claude | feat/gateway | 2026-10-10 | 2026-10-10 | correlationId header-safe (Plano 2) |
| resilience | packages/resilience | done | claude | feat/foundation-protocol-resilience | 2026-10-10 | 2026-10-10 | |
| svc-cotacao | apps/svc-cotacao | not_started | - | - | - | - | Outro agente; contrato em docs/superpowers/specs/2026-10-10-internal-services-contracts.md |
| svc-apolice | apps/svc-apolice | not_started | - | - | - | - | Outro agente; mesmo contrato |
| svc-sinistro | apps/svc-sinistro | not_started | - | - | - | - | Outro agente; mesmo contrato |
| chatbot | apps/chatbot | done | claude | feat/flow-pendencias | 2026-10-10 | 2026-10-11 | Dockerfile não verificado (sem Docker); Plano 6: sensitive no JSON do Flow de cotação, Flow de demonstração (demo-componentes) no catálogo, tratamento explícito de user.flow_data_exchange (sem resposta, log só com contagem de chaves), Logger.debug |
| gateway | apps/gateway | done | claude | feat/chatbot | 2026-10-10 | 2026-10-10 | Dockerfile não verificado (sem Docker) |
| web-chat | apps/web | done | claude | feat/flow-pendencias | 2026-10-11 | 2026-10-11 | Plano 4 concluído; web-flows será recriada no Plano 5; Plano 6: randomId com fallback fora de contexto seguro (transport/chat-client e chat/useChat), cópias dos Flows para testes unitários + teste de sincronização com o chatbot, e2e lê os JSONs do chatbot, resumo mascara cpf/nascimento |
| web-flows | apps/web/src/flows | done | claude | feat/web-flows | 2026-10-11 | 2026-10-11 | Plano 5 concluído (demo Flow + E2E). Integração fora de src/flows: app/App.tsx, renderers/flow-host.ts + remoção do FlowPlaceholder, chat/useChat.ts, chat/persistence.ts, chat/model.ts, chat/reducer.ts, transport/chat-client.ts, eslint.config.js, .dependency-cruiser.cjs; e2e/ (mock e jornadas) e CHECKLIST.md do web. Pendências no CHECKLIST do web |
