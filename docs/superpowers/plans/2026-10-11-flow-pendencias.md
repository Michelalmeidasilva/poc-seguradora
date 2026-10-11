# Flow Pendências Implementation Plan (Plan 6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the pendências left by Plan 5: (1) the chat must not break on plain-`http` origins, (2) CPF and birth date must never appear in clear in the persisted Flow summary, (3) the chatbot must ship the demo Flow and handle `user.flow_data_exchange` explicitly, (4) the Flow JSON copies shared by chatbot and web must not drift.

**Architecture:** Small, independent changes in `apps/web/src/transport` + `chat` (id generation), `apps/chatbot` (catalog, dialog, handle-turn, Flow JSON files) and the e2e mock. The chatbot owns the canonical Flow JSON files; web keeps unit-test copies guarded by a sync test; the e2e mock reads the chatbot files directly.

**Tech Stack:** TypeScript strict, Vitest, Playwright (local), existing Zod protocol. No new dependency.

**Spec:** `docs/superpowers/specs/2026-10-10-whatsapp-chatbot-poc-design.md` (sections 5 and 7); `docs/superpowers/specs/2026-10-10-gateway-chatbot-contract.md`; Plan 5 decisions in `apps/web/CHECKLIST.md` ("Decisões próprias" and "Pendências").

## Global Constraints

- Ownership: this plan edits `apps/chatbot/**` (row `chatbot`) and `apps/web/**` (row `web-chat`, which covers `apps/web/src/flows`, row `web-flows` is `done`); both rows are reopened to `in_progress` on branch `feat/flow-pendencias` and set back to `done` at the end. No edits to `packages/protocol`, `apps/gateway` or `svc-*`.
- Max event size is 65536 bytes (`LIMITS.maxEventBytes`): the demo `message.flow` (8.9 KB) fits; a test must assert the serialized demo event stays under 32768 bytes.
- `FlowPayload` constraints (protocol): `body` ≤ 1024, `ctaLabel` ≤ 20, `header` ≤ 60, `footer` ≤ 60, `flowId` non-empty, `flowJson` a record.
- No personal data in logs: the chatbot never logs Flow `data` values, only keys count/flowId.
- The demo Flow is fictitious content (no real names, CPFs, URLs; `.invalid` TLD for links).
- Web rules from Plan 5 still hold (depcruise, `flows/` isolation); chatbot rules: hexagonal `domain/application/infra`, domain pure.
- Comments English, UI strings pt-BR, conventional commits, `CHECKLIST.md` updated in the same commit as each item.

## Review Focus

1. The chat must work end to end on `http://<lan-ip>` where `crypto.randomUUID` is undefined (send a message, voice, flow submit, reload, retry).
2. A Flow submit whose summary is persisted: `cpf` and `nascimento` never appear in the visible bubble, in `sessionStorage`, or in the `user.flow_submit` summary text, but the **payload** sent to the chatbot still carries the real values (the chatbot needs them to quote).
3. `user.flow_data_exchange` from any session state: no reply, no state change, no data in logs, turn finishes (no hang), idempotent on replay.
4. `user.flow_submit` for an unknown `flowId` (neither `cotacao` nor `demo`): ignored without error (existing behaviour) — and for `demo`: acknowledged with a short text, **without echoing the data back**.
5. Web fixture copies of the Flow JSON drifting from the chatbot's canonical files: the sync test fails loudly with the differing file name.

---

### Task 1: Id generation that works without a secure context

**Files:**
- Create: `apps/web/src/transport/random-id.ts`, `apps/web/src/transport/random-id.test.ts`
- Modify: `apps/web/src/transport/chat-client.ts` (default `newId`), `apps/web/src/chat/useChat.ts` (voice `mediaId`), their tests, `apps/web/CHECKLIST.md`

**Interfaces:**
- Produces: `randomId(): string` — UUID v4 string. Uses `crypto.randomUUID` when it is a function, otherwise builds a v4 UUID from `crypto.getRandomValues` (version nibble 4, variant `10`), never `Math.random`.
- Consumes: nothing. `flows/components/MediaPickers.tsx` keeps its own `newMediaId` (Plan 5; `flows/` must not import `transport/`).

- [ ] **Step 1: Tests first** (`random-id.test.ts`): native path used when present (stub returns a known value); with `crypto.randomUUID` stubbed `undefined` the result matches `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/`; 1000 ids are unique; stubs are restored (`vi.unstubAllGlobals`). Plus: `ChatClient` created without `newId` still sends a `user.text` when `randomUUID` is undefined (use the existing fake-api); `useChat.sendVoice` creates `local-<uuid>` media ids with `randomUUID` undefined.
- [ ] **Step 2:** Run `cd apps/web && npx vitest run src/transport src/chat` → FAIL (real RED output in the report).
- [ ] **Step 3: Implement** `random-id.ts`; replace the two `crypto.randomUUID()` call sites (`chat-client.ts` default `newId`; `useChat.ts` voice draft) and any other non-test use found by `grep -rn randomUUID apps/web/src` outside `flows/`.
- [ ] **Step 4:** Tests PASS; `pnpm typecheck && pnpm lint && npx prettier --check . && pnpm depcruise`.
- [ ] **Step 5:** Move the "`crypto.randomUUID` em HTTP" item from Pendências to done in `apps/web/CHECKLIST.md`; commit `fix(web): ids that work outside secure contexts`.

---

### Task 2: Canonical Flow JSON, `sensitive` fields and drift guard

**Files:**
- Modify: `apps/chatbot/src/domain/flows/cotacao.flow.json` (add `"sensitive": ["cpf", "nascimento"]` to screen `DADOS`; check the web schema: `sensitive?: string[] | boolean` on the screen), `apps/web/src/flows/fixtures/cotacao.flow.json` (same content), `apps/chatbot/src/domain/catalog.test.ts`
- Create: `apps/chatbot/src/domain/flows/demo-componentes.flow.json` (byte-identical copy of `apps/web/src/flows/fixtures/demo-componentes.flow.json`), `apps/chatbot/src/domain/flows-sync.test.ts`
- Modify: `apps/web/e2e/mock-gateway.mjs` (read `cotacao` and `demo` Flow JSON from `../../chatbot/src/domain/flows/` instead of the web fixtures), `apps/web/e2e/chat.spec.ts`, `apps/web/CHECKLIST.md`, `apps/chatbot/CHECKLIST.md`

**Interfaces:**
- Produces: `flows-sync.test.ts` reads both directories with `node:fs` (path resolved from `import.meta.url`, no import of web code) and asserts `JSON.parse` deep equality for `cotacao.flow.json` and `demo-componentes.flow.json`, with a failure message naming the file and the two paths.

- [ ] **Step 1: Tests first.** `flows-sync.test.ts` (fails until the demo file exists and `cotacao` copies are in sync); `catalog.test.ts`: the quote Flow's `DADOS` screen declares `sensitive` containing exactly `cpf` and `nascimento`; web `actions.test.tsx` (or a new `summary-sensitive.test.ts`) building the summary from the **cotação fixture** and a payload `{ produto:'AUTO', nome:'Maria Teste', cpf:'12345678909', nascimento:'1990-01-15', marca:..., ... }` asserts the summary contains neither `12345678909` nor `1990-01-15` and contains `••••`.
- [ ] **Step 2:** Run the focused tests → FAIL (real RED).
- [ ] **Step 3: Implement**: edit the JSON files; add the demo copy; update the mock to read the chatbot files (resolve paths relative to the mock file; keep a clear error if a file is missing).
- [ ] **Step 4: e2e (journey a, extended):** after the cotação submit, assert (i) the summary bubble text does not contain the typed CPF or birth date, (ii) `sessionStorage` (read via `page.evaluate`, all keys) contains neither value anywhere, (iii) the recorded `user.flow_submit` payload at `/__events` **does** carry the real values. Run `cd apps/web && CI=1 pnpm exec playwright test` → green twice.
- [ ] **Step 5:** Full web + chatbot suites, typecheck, lint, prettier, depcruise; update both CHECKLISTs (remove the "sensitive" pendência, note the drift guard); commit `fix(flows): mask cpf and nascimento in the flow summary and guard fixture drift`.

---

### Task 3: Chatbot demo Flow and explicit `flow_data_exchange` handling

**Files:**
- Modify: `apps/chatbot/src/domain/catalog.ts` (`demoFlow()`, `demoFlowReceived()`), `apps/chatbot/src/domain/dialog.ts` (typed trigger, `flow_submit` for `demo`), `apps/chatbot/src/application/handle-turn.ts` (explicit `data_exchange` branch), their tests (`catalog.test.ts`, `dialog.test.ts`, `handle-turn.test.ts`, `typed-journeys.test.ts`, `e2e.test.ts`), `apps/chatbot/CHECKLIST.md`

**Interfaces:**
- `demoFlow(): ReplyBody[]` → one `message.flow` with `flowId: 'demo'`, `header: 'Demonstração'`, `body` ≤ 1024 explaining the Flow, `ctaLabel: 'Abrir demonstração'`, `flowJson: structuredClone(demo JSON)`.
- `demoFlowReceived(): ReplyBody[]` → text `Recebi o formulário de demonstração. Nenhum dado foi guardado.` plus the menu quick-reply (`MENU_OPTION`). Never includes submitted values.
- Dialog: the exact typed word `demo` (fold-insensitive, trimmed) or the phrase `demo flow` triggers `demoFlow()` from any state except `claim.awaiting_description` (free text, like the existing rule: there only `cancelar` interrupts); state is left unchanged (`reply(state, ...)`), except it returns to `IDLE` when the state was idle. `flow_submit` with `flowId === 'demo'` → `demoFlowReceived()` from any state; any other unknown `flowId` stays ignored (`undefined`).
- `handle-turn`: replace the implicit skip by an explicit, documented branch for `user.flow_data_exchange`: no typing indicator, no dialog input, no reply events, the turn record finishes normally (idempotent replay returns the same empty turn), and the logger gets `{ sessionId, correlationId, flowId, screen, action, dataKeys: <count> }` at debug level — never the values.

- [ ] **Step 1: Tests first**: catalog (payload constraints, size < 32768 bytes serialized event, validates against the protocol `FlowPayload` schema), dialog (trigger words; not triggered inside claim description; `flow_submit demo` from several states; unknown flowId ignored; reply never contains submitted values — use a payload with a canary string), handle-turn (data_exchange: zero events emitted besides turn completion, no state change, log contains canary-free `dataKeys` count and not the canary; replay of the same event id is idempotent), typed-journeys (typing `demo flow` through the real classifier), `e2e.test.ts` (POST `/v1/chat/events` with `user.flow_data_exchange` returns 200 with an empty NDJSON body that ends cleanly).
- [ ] **Step 2:** Run `cd apps/chatbot && npx vitest run` focused files → FAIL (real RED).
- [ ] **Step 3: Implement** as specified. Keep `domain/` pure (the JSON import follows the existing `quoteFlowJson` pattern).
- [ ] **Step 4:** Chatbot suite + typecheck + lint + depcruise green.
- [ ] **Step 5:** Tick/update `apps/chatbot/CHECKLIST.md` (demo Flow, data_exchange behaviour, the removed "JSON proposto" pendência replaced by "validar no Playground da Meta"); commit `feat(chatbot): demo flow and explicit flow data exchange handling`.

---

### Task 4: Wire-up, docs and workboard

**Files:**
- Modify: `apps/web/e2e/mock-gateway.mjs` (the `demo flow` reply already exists; keep as is), `apps/web/CHECKLIST.md`, `apps/chatbot/CHECKLIST.md`, `WORKBOARD.md`

- [ ] **Step 1:** Add one e2e journey that exercises the chatbot's **catalog output** shape through the mock: the mock's `demo flow` reply must come from the chatbot's JSON (Task 2) — assert the journey (b) of Plan 5 still passes unchanged. No new journey if (b) already covers it; otherwise add the minimal one.
- [ ] **Step 2: Full verification at the repo root** (read every output): `pnpm typecheck && pnpm lint && npx prettier --check . && pnpm depcruise && pnpm test && pnpm build && node scripts/workboard-check.mjs`; then the e2e suite twice, all green.
- [ ] **Step 3:** Update both CHECKLISTs ("Pendências" reflect what remains: `/v1/media`, deploy plan, Playground validation, Escape + native pickers outside Chromium, media values in `navigate`, server-visible `data_exchange` errors, a protocol event for "server decides the next screen"); set the rows `chatbot` and `web-chat` back to `done` (keep `Dono`, `Atualizado` 2026-10-11, `Notas` listing what Plan 6 changed); `node scripts/workboard-check.mjs` → ok.
- [ ] **Step 4:** Commit `docs: flow pendencias checklist and workboard`.

---

## Pendências fora deste plano (registrar no ledger)

- Gateway `/v1/media` upload for voice and Flow media (ids stay `local-*`).
- A protocol event so the server can decide the next screen after `data_exchange` (today the web advances optimistically and the chatbot answers nothing).
- Validate the Flow JSON files in the Meta Playground when access exists.
- Deploy plan (Cloud Run, `docker build`, `nginx -t`, `TRUST_PROXY_HOPS`, Origin/cookies) and a full-stack integration test with the real `svc-*`.
