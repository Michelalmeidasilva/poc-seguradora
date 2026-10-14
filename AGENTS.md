# Regras para agentes e pessoas

Vale para qualquer chatbot, agente de código ou pessoa que trabalhe neste repositório (claude, codex, cursor, antigravity, copilot, gemini e outros). Fonte: seção 15.3 do spec `docs/superpowers/specs/2026-10-10-whatsapp-chatbot-poc-design.md`.

1. Leia o `WORKBOARD.md` antes de tocar no código (`git pull` antes, se houver remoto).
2. Reivindique uma linha `not_started` em um commit próprio (`chore(workboard): claim <workstream>`): `Status` `in_progress`, `Dono`, `Branch`, `Iniciado`, `Atualizado`. Só então escreva código.
3. Um dono por caminho: edite apenas os arquivos do seu `Caminho`. Para mudar arquivo de outra frente, peça ao dono ou registre em `Notas` da linha dele.
4. Trabalhe em branch própria, de preferência em um `git worktree`.
5. Um único repositório git, na raiz. Nunca rode `git init` dentro de `apps/*` ou `packages/*`.
6. Registre entregas, decisões e pendências duradouras em `docs/development-history/<projeto>.md`; não use checklist como bloqueio global.
7. Marque uma linha como `done` quando o escopo declarado estiver concluído e a evidência proporcional abaixo tiver passado.
8. Reivindicação sem atualização há mais de 24 h pode ser retomada; registre em `Notas` de quem era e o motivo.
9. Rode `node scripts/workboard-check.mjs` antes de cada commit que altere o `WORKBOARD.md`.

## Validação proporcional

| Escopo | Evidência mínima |
|---|---|
| Git, documentação ou governança | `git diff --check`; também `node scripts/workboard-check.mjs` para workboard/skills |
| Um app ou pacote | teste e typecheck do workspace afetado |
| Jornada web/Flow | testes web e E2E apenas da jornada alterada |
| Integração multiapp | testes dos workspaces afetados; `pnpm test` apenas quando cruzar fronteiras de execução |
| Release, deploy, GCP ou ambiente compartilhado | suíte raiz, build e smoke/E2E aplicáveis |

Merge local, documentação e governança não implicam push, release, deploy ou suíte de produto.

Regras de código (seção 14 do spec): arquitetura hexagonal `domain` / `application` / `infra` / `main.ts` nos serviços, com dependências só em `infra → application → domain`; validação Zod nas bordas; erros esperados como valores (Result); commits convencionais.

Agentes de qualquer ferramenta: use `.agents/skills/monorepo-services/SKILL.md` para localizar a frente e `.agents/skills/deploy-service/SKILL.md` para deploy local por serviço.
