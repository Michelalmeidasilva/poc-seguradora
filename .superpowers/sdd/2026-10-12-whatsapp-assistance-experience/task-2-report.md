# Task 2 report — assistance journey domain

Status: DONE

## Delivered

- Added a deterministic chatbot catalog with 24 functional groups and 247 unique steps. The 34 `LEG` steps are not emitted, and every declared destination is checked against the executable catalog.
- Preserved the canonical prototype as the source of IDs, copy, modes, actions, flow definitions, and destinations. `generate-assistance-catalog.mjs` executes the browser IIFE in an isolated Node VM, filters `LEG`, performs only the SPEC-approved `IDE` CPF-only conversion, and writes `assistance-catalog.generated.json`.
- Added a drift test that executes the canonical IIFE independently and compares all non-`LEG` IDs, text, mode, auth requirement, actions, and flow content. The `IDE` test preserves IDs/actions (including the approved redirect), requires a CPF-only form, and rejects OTP/identity-verification behavior.
- Kept filesystem and VM access out of runtime domain modules. Regenerate with `node apps/chatbot/src/domain/generate-assistance-catalog.mjs`; generated JSON is checked in beside the pure domain catalog and the drift test fails when it diverges from the canonical source.
- Added pure journey transitions covering personal-entry gating, public discovery, accepted CPF format without storing the submitted value, stale/valid quick replies, unknown/legacy destinations, and confirmation-only review routing.
- Added explicit-field dependent parsing for name, 11-digit CPF, valid birth date, and kinship. Missing or malformed values remain absent; sex/gender is never inferred, and a requested name correction preserves the other provided fields.
- Updated `apps/chatbot/CHECKLIST.md` for Task 2.

## Verification

- TDD RED: the first targeted run failed because the three implementation modules did not exist. The first broad `pnpm ... test -- ...` invocation exposed this repository's argument forwarding and attempted unrelated tests; the targeted Vitest invocation was then used for focused RED/GREEN cycles.
- Targeted domain tests: PASS, 14 tests across 3 files.
- Chatbot full suite: PASS, 510 tests across 21 files.
- Chatbot strict typecheck: PASS.
- `node scripts/workboard-check.mjs`: PASS.
- Generator completed successfully; the catalog drift test compares its runtime output against execution of the canonical catalog.

## Addendum — approved dependent statement

Added the approved concrete phrase as a test, observed RED (`name: "meu"`; CPF and birth missing), then taught the parser the explicit forms “meu filho”, “CPF dele é” and “ele nasceu em”. The test now returns name `João da Silva`, CPF digits `12345678910`, birth `2004-03-12`, and relationship `filho`; it does not return a biological-sex field. The focused parser test and chatbot typecheck pass after the change.

## Addendum — public product chooser regression

The reviewer found that the previous public-offering assertion allowed an unlisted fourth service. Added a focused test for the public chooser `DES-01`: its complete actionable label set must equal exactly `Assistência Farmácia`, `Assistência Funeral`, and `Telemedicina`; its actual `{label, detail, target}` entries must equal the entries from the independently executed canonical IIFE, and each actual target ID must resolve in the runtime catalog. This uses the canonical runtime IDs/targets rather than a hand-built target fixture. Runtime/catalog content was already correct, so this was a coverage-only correction: the pre-change focused catalog suite passed (5 tests), then the new focused test passed (6 tests).

Commands and results:

```text
XDG_CACHE_HOME=/private/tmp/codex-cache pnpm --filter @seguradora/chatbot exec vitest run --cache=false src/domain/assistance-catalog.test.ts
Before assertion: PASS, 5 tests; after assertion: PASS, 6 tests.

XDG_CACHE_HOME=/private/tmp/codex-cache pnpm --filter @seguradora/chatbot exec vitest run --cache=false
PASS, 21 test files, 512 tests.

pnpm --filter @seguradora/chatbot typecheck
PASS. First run identified a possibly undefined indexed chooser in the new test; added an explicit missing-chooser guard and reran successfully.
```

The approved João statement regression remains in place and passes in the 512-test suite. Gate-state persistence remains deferred to Task 5 per controller ruling; this fix does not alter gate state or WORKBOARD.

## Scope and limitations

- No prototype, protocol, web, or WORKBOARD files were changed. The existing modification to `task-1-report.md` was preserved and excluded from this task's commit.
- The journey transition API returns the selected step only; persistence and actual mutations remain responsibilities of later application work. This task does not implement the application/adapter layer.
- CPF handling is format-only and demonstrative, as required by the SPEC; it does not authenticate or retain the initial CPF.
