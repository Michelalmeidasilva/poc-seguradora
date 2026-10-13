# Task 1 — contrato de cartões de documento

Status: DONE_WITH_CONCERNS

## Implementação

- Adicionados `DocumentItemSchema`, `DocumentPayloadSchema` e o tipo `DocumentPayload` inferido pelo Zod.
- O payload e cada item são estritos. A lista aceita de 1 a 10 itens; `id` e `title` não podem ser vazios; `title` tem limite de 120 caracteres; `status` aceita somente `available` ou `generating`.
- Adicionado `message.document` à união `ServerEventSchema`, preservando o envelope existente. Nenhum campo de URL ou arquivo é permitido.
- Incluídos contratos para estados válidos, lista vazia e acima do limite, status inválido, campos não reconhecidos e envelope completo.
- O CHECKLIST do protocolo registra a funcionalidade como pendente porque a validação integral ainda depende de integrar o evento no parser sem `seq`.

## TDD e validação

- RED: antes da implementação, os dois casos válidos para `message.document` falharam em `parseServerEvent`, como esperado.
- Focado: `pnpm --filter @seguradora/protocol exec vitest run --no-cache src/events.test.ts` — PASS, 52/52.
- Typecheck: `pnpm --filter @seguradora/protocol typecheck` — PASS.
- Suíte completa: `pnpm --filter @seguradora/protocol test --no-cache` — 88/90 passaram; duas falhas relacionadas ao novo tipo:
  - `parseChatbotLine > accepts error without seq` (o teste parametrizado do parser ainda não inclui `message.document`).
  - `UnsequencedServerEventSchema drift guard > covers every server event type` (a união sem `seq` tem 12 variantes contra 13 em `ServerEventSchema`).

O ajuste necessário fica em `packages/protocol/src/chatbot-contract.ts`, fora dos caminhos autorizados para esta tarefa. Por isso a funcionalidade segue sem `[x]` no checklist e a suíte completa não pode ser declarada verde dentro do escopo recebido. As execuções Vitest também reportaram `EPERM` ao tentar gravar `packages/protocol/node_modules/.vite/vitest/results.json`; `--no-cache` removeu esse erro operacional das execuções seguintes.

## Commit

`e9bcbfa feat(protocol): add document message event`

## Fix round 1

Status: DONE

- Added `message.document` to `UnsequencedServerEventSchema` in the same order as `ServerEventSchema`, preserving the existing parsing behavior and gateway-owned `seq` semantics.
- Added a `parseChatbotLine` acceptance fixture for `message.document` without `seq`.
- Added a direct regression test proving `DocumentPayloadSchema` rejects an unknown root field. The schema already used `.strict()`; this test now protects that behavior.
- Updated the protocol checklist to mark `message.document` complete.

### RED/GREEN and verification

- RED: `pnpm --filter @seguradora/protocol exec vitest run --no-cache src/chatbot-contract.test.ts src/events.test.ts` — parser fixture and drift guard failed (2 tests); the new root-unknown-field assertion passed.
- Focused GREEN: same command after implementation — PASS, 73/73 tests across 2 files.
- Full suite: `pnpm --filter @seguradora/protocol test --no-cache` — PASS, 92/92 tests across 3 files.
- Typecheck: `pnpm --filter @seguradora/protocol typecheck` — PASS.
- `git diff --check` — PASS.

Commit: `fix(protocol): include document in unsequenced events`.
