# Regras para agentes e pessoas

Vale para qualquer chatbot, agente de código ou pessoa que trabalhe neste repositório (claude, codex, cursor, antigravity, copilot, gemini e outros). Fonte: seção 15.3 do spec `docs/superpowers/specs/2026-10-10-whatsapp-chatbot-poc-design.md`.

1. Leia o `WORKBOARD.md` antes de tocar no código (`git pull` antes, se houver remoto).
2. Reivindique uma linha `not_started` em um commit próprio (`chore(workboard): claim <workstream>`): `Status` `in_progress`, `Dono`, `Branch`, `Iniciado`, `Atualizado`. Só então escreva código.
3. Um dono por caminho: edite apenas os arquivos do seu `Caminho`. Para mudar arquivo de outra frente, peça ao dono ou registre em `Notas` da linha dele.
4. Trabalhe em branch própria, de preferência em um `git worktree`.
5. Um único repositório git, na raiz. Nunca rode `git init` dentro de `apps/*` ou `packages/*`.
6. Atualize o `CHECKLIST.md` do serviço no mesmo commit que conclui cada item. Marque `[x]` só com código, testes passando e commit feito.
7. Marque a linha como `done` apenas com o `CHECKLIST.md` completo e os testes passando.
8. Reivindicação sem atualização há mais de 24 h pode ser retomada; registre em `Notas` de quem era e o motivo.
9. Rode `node scripts/workboard-check.mjs` antes de cada commit que altere o `WORKBOARD.md`.

Regras de código (seção 14 do spec): arquitetura hexagonal `domain` / `application` / `infra` / `main.ts` nos serviços, com dependências só em `infra → application → domain`; validação Zod nas bordas; erros esperados como valores (Result); commits convencionais.
