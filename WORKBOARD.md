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
| chatbot | apps/chatbot | done | claude | feat/chatbot | 2026-10-10 | 2026-10-10 | Dockerfile não verificado (sem Docker) |
| gateway | apps/gateway | done | claude | feat/chatbot | 2026-10-10 | 2026-10-10 | Dockerfile não verificado (sem Docker) |
| web-chat | apps/web/src/chat, apps/web/src/renderers, apps/web/src/transport | not_started | - | - | - | - | |
| web-flows | apps/web/src/flows | not_started | - | - | - | - | |
| ux-whatsapp-prototype | docs/prototypes/whatsapp-experience | done | codex | feat/whatsapp-experience-prototype | 2026-10-10 | 2026-10-11 | 268 estados; autenticação demonstrativa obrigatória nos 238 pessoais, CPF e código, retomada e expiração; testes de navegador, suíte geral e typecheck passaram; backend inalterado |
