---
name: task-tracking
description: Use before starting or finishing work in this monorepo to classify task complexity and record task and test execution timings.
---

# Task tracking

Use this skill with `workboard-protocol` for every code, documentation, configuration, test, design, review, or operational task in this repository. It creates an auditable planning and execution trail; it does not replace the workboard, service checklists, commits, or verification.

## Before work starts

Create or update one row in `.agents/metrics/task-execution-log.md` before changing the task artifacts. Record:

- a stable `TASK-YYYYMMDD-NNN` id;
- status `planned`, `in_progress`, `blocked`, `done`, or `cancelled`;
- owner and branch;
- complexity from the scale below;
- the user prompt verbatim when it contains no sensitive information, otherwise a faithful redacted summary;
- the applicable SPEC/plan/reference path and section, or `N/A — no spec applies` with a short reason;
- start time in ISO 8601 with timezone.

If an existing task is extended by a later user message, keep the original row and append the new request in its prompt/context field. Start a new row only when the work has a separately verifiable outcome.

## Complexity scale

Choose the highest level that describes the actual work, not the desired speed.

| Level | Meaning |
|---|---|
| 1 — trivial | Isolated wording, metadata, or mechanical change with one clear verification. |
| 2 — bounded | One existing behavior or small set of files; no public contract or cross-service change. |
| 3 — moderate | Multiple related files, tests, or a user journey within one product area. |
| 4 — high | Cross-workspace/service behavior, migration, deployment, broad E2E coverage, or material coordination. |
| 5 — architectural | New subsystem, interface/contract redesign, security-sensitive change, or several independently owned workstreams. |

Reclassify the row if discovery changes the scope; retain the original level and explain the change in Notes.

## During and after work

- Add blocked intervals and their reason when waiting on the user, external systems, approvals, or another owner. Do not count those intervals as active execution.
- At completion or handoff, record `finished_at`, `active_seconds`, `blocked_seconds`, `elapsed_seconds`, outcome, verification evidence, commit(s), and artifact links. `elapsed_seconds` is finish minus start; `active_seconds` excludes recorded blocks.
- Never place credentials, personal data, tokens, raw production payloads, or private user prompts in either log.
- A task is not `done` in the log merely because time was recorded. Apply the normal workboard/checklist completion rules.

## Test timings

For every verification run that is used as evidence for a task outcome, append a row to `.agents/metrics/test-execution-timings.md`. Log the real command, test type, scope, environment, start/end, duration in seconds, result, and task id.

Use one of: `unit`, `integration`, `e2e`, `live-e2e`, `smoke`, `build`, `lint`, `typecheck`, `static-analysis`, `security`, or `other`. Record failed and interrupted evidence runs too; mark their result accurately. Do not log exploratory repetitions that do not influence a decision.

The logs are append-only for completed runs. Correct an entry by appending a correction that references its row; do not rewrite history.

## Files

- Task log: `.agents/metrics/task-execution-log.md`
- Test timing log: `.agents/metrics/test-execution-timings.md`
- Governance integration: `.agents/skills/workboard-protocol/SKILL.md`

