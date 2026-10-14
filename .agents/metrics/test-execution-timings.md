# Tempos de execução de testes

Registro versionado e append-only das execuções usadas como evidência. Horários usam ISO 8601 com fuso e duração usa segundos. Não registrar argumentos, variáveis ou saídas que exponham segredos ou dados pessoais.

| Task ID | Tipo | Escopo | Comando | Ambiente | Início | Fim | Duração (s) | Resultado | Observações / artefato |
|---|---|---|---|---|---|---|---:|---|---|
| TASK-20261014-001 | static-analysis | Estrutura da skill | `python3 /Users/user/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/task-tracking` | macOS local, Python 3 | 2026-10-14T08:06:25-03:00 | 2026-10-14T08:06:33-03:00 | 8 | blocked | Validador indisponível: módulo `yaml` (PyYAML) não instalado; nenhuma dependência foi instalada. |
| TASK-20261014-001 | static-analysis | Workboard | `node scripts/workboard-check.mjs` | macOS local, Node 24 | 2026-10-14T08:06:33-03:00 | 2026-10-14T08:06:33-03:00 | 0 | passed | Confirma skill, links e workboard válidos. |
| TASK-20261014-001 | static-analysis | Árvore de trabalho | `git diff --check` | macOS local, Git | 2026-10-14T08:06:33-03:00 | 2026-10-14T08:06:33-03:00 | 0 | passed | Sem erro de whitespace. |
| TASK-20261014-002 | static-analysis | Skill `task-tracking` | `.venv/bin/python /Users/user/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/task-tracking` | macOS local, Python 3.14, PyYAML 6.0.3 | 2026-10-14T08:10:17-03:00 | 2026-10-14T08:10:33-03:00 | 16 | passed | Frontmatter e estrutura da skill válidos. |
| TASK-20261014-002 | static-analysis | Workboard e whitespace | `node scripts/workboard-check.mjs && git diff --check` | macOS local, Node 24 e Git | 2026-10-14T08:10:17-03:00 | 2026-10-14T08:10:33-03:00 | 16 | passed | Workboard válido e sem erro de whitespace. |
| TASK-20261014-003 | integration | Suíte monorepo antes da promoção | `pnpm test` | macOS local, Node 24, pnpm | 2026-10-14T08:16:10-03:00 | 2026-10-14T08:17:36-03:00 | 86 | passed | 93 protocol, 63 resilience, 177 gateway, 661 chatbot, 942 web, 116 verificadores e 52 cenários de deploy; exit 0. |

