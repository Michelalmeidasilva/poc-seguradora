---
name: workboard-protocol
description: Use before starting, continuing or finishing any task in this monorepo (code, docs, tests, config). Enforces the multi-agent WORKBOARD.md protocol, per-service CHECKLIST.md updates and the project spec rules, so several agents (claude, codex, cursor, antigravity, others) and people can work in parallel without colliding.
---

# Workboard protocol

Source of truth: `docs/superpowers/specs/2026-10-10-whatsapp-chatbot-poc-design.md` (sections 14 and 15) and, for the internal services, `docs/superpowers/specs/2026-10-10-internal-services-contracts.md`. If this skill and the spec disagree, the spec wins; tell the user and fix the skill.

This applies to every agent and person who works in this repository, with no exceptions.

## Before writing any code

1. **Repository ready?** There is one git repository, at the root. Do not run `git init` inside `apps/*` or `packages/*`. If the monorepo structure, `WORKBOARD.md`, `AGENTS.md` or `scripts/workboard-check.mjs` do not exist yet, stop and tell the user: they must be created first (spec 15.1).
2. **Read `WORKBOARD.md`** (run `git pull` first if a remote exists). Never rely on memory of an earlier read.
3. **Pick a workstream.**
   - Take a `not_started` row, or the one the user named.
   - If the row is `in_progress` with another owner and updated less than 24 h ago, do not touch it. Tell the user and pick another.
   - A row `in_progress` with no update for more than 24 h may be taken over. Record in `Notas` whose it was and why.
4. **Claim it** in its own commit, before any code:
   - set `Status` to `in_progress`, and fill `Dono` (your tool: `claude`, `codex`, `cursor`, `antigravity` or `human:<name>`), `Branch`, `Iniciado` and `Atualizado`;
   - commit message `chore(workboard): claim <workstream>`;
   - on a merge conflict, whoever integrated first keeps the row; pick another.
5. **Isolate:** work on your own branch, preferably in a separate `git worktree`.
6. Run `node scripts/workboard-check.mjs` and make sure it passes.

## While working

- **One owner per path.** Edit only the files under your row's `Caminho`.
  - For a file owned by another workstream (especially `packages/protocol`), ask the owner or note it in that row's `Notas`. Do not edit it.
  - The internal services contract changes only by agreement.
- **Follow the spec's code rules (section 14):**
  - hexagonal structure `domain` / `application` / `infra` / `main.ts`, with dependencies only `infra → application → domain`;
  - Zod validation at the borders, config from validated env vars, stable error codes, manual dependency injection;
  - Result type for expected errors; domain and application tested without I/O.
- **Keep `CHECKLIST.md` honest.** Update the service's `CHECKLIST.md` in the same commit that finishes an item. Mark `[x]` only when the code exists, its tests pass and the commit is made.
- **Commits:** small, conventional (`feat:`, `fix:`, `docs:`, `chore:`, `test:`).
- **Milestones:** update `Atualizado` and `Notas` in the `WORKBOARD.md` row. If you get stuck, set `blocked` and write the reason.

## Before saying "done"

1. Every item in the service's `CHECKLIST.md` is `[x]`, lint and strict `tsc` are clean, and the tests pass. Run them and read the output; do not assume.
2. Set the row to `done` (keep `Dono`), update `Atualizado`, and commit.
3. Run `node scripts/workboard-check.mjs` again.
4. Tell the user plainly what was done and what was not.

## Rationalizations to refuse

| Thought | Reality |
|---|---|
| "It's a tiny change, I'll skip the claim" | Small edits collide too. Claim first. |
| "The row looks stale, I'll just edit" | Stale means more than 24 h. Record the takeover in `Notas`. |
| "I only need to touch one file in another workstream" | Ask the owner, or record it in their `Notas`. |
| "I'll update the checklist at the end" | Same commit as the item, so the file never lies. |
| "I'll `git init` here to keep my work separate" | One repo, at the root. Use a branch or worktree. |

## Quick reference

```
read WORKBOARD.md → pick row → claim commit → own branch/worktree
→ work only in your path → CHECKLIST.md with each item → tests pass
→ row = done → workboard-check passes
```
