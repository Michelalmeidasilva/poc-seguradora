# Governança enxuta por projeto

**Status:** proposta aprovada em conversa; aguarda revisão deste documento antes da implementação.

## Objetivo

Substituir checklists operacionais persistentes por documentação histórica de entregas e decisões. Cada projeto passa a ter uma única instrução local (`AGENTS.md`) com escopo, referências e comandos de validação proporcionais à mudança. O objetivo é preservar rastreabilidade sem transformar tarefas administrativas ou pontuais em validações de release.

## Escopo

- Remover os `CHECKLIST.md` atuais de apps, pacotes, infra e protótipo UX.
- Criar `docs/development-history/` com um documento por projeto migrado, preservando entregas verificadas, pendências e decisões existentes.
- Manter `AGENTS.md` na raiz para regras transversais do monorepo e criar um `AGENTS.md` local por projeto: `apps/chatbot`, `apps/gateway`, `apps/web`, `apps/svc-*`, `packages/protocol`, `packages/resilience`, `infra` e `docs/prototypes/whatsapp-experience`.
- Substituir as referências normativas a `CHECKLIST.md` no `AGENTS.md` raiz, no protocolo de workboard, nas skills de localização de serviços, no SPEC principal e nos planos ainda ativos.
- Definir uma matriz de validação por risco e uma política de merge proporcional.

O código de produto, contratos, fluxos e comportamento de execução não fazem parte desta mudança.

## Modelo documental

### Histórico de desenvolvimento

Cada arquivo em `docs/development-history/` será uma fonte de contexto, não um bloqueio de execução. Terá as seções:

1. **Entregas verificadas** — capacidades já implementadas e a evidência conhecida.
2. **Decisões e limites** — escolhas técnicas e de produto ainda relevantes.
3. **Pendências conhecidas** — itens futuros, sem caixa de seleção nem requisito de conclusão global.
4. **Referências** — SPECs, planos, contratos e comandos do projeto.

O conteúdo dos checklists será migrado sem inventar confirmação nova. Itens já marcados como concluídos entram em “Entregas verificadas”; itens abertos entram em “Pendências conhecidas”.

### `AGENTS.md` por projeto

Cada projeto terá exatamente um arquivo local contendo:

- propósito e fronteiras do projeto;
- caminhos que não devem ser modificados sem coordenação;
- comandos de teste, typecheck, lint/build disponíveis naquele projeto;
- quando executar E2E, smoke ou validações de integração;
- links para seu histórico e contratos relevantes.

O arquivo raiz permanece como regra do repositório e coordenação entre projetos. Arquivos locais não repetem regras globais nem criam um segundo processo de aprovação.

## Matriz de validação

| Mudança | Evidência mínima obrigatória | Não obrigatória por padrão |
|---|---|---|
| Git, documentação, governança, histórico ou instruções | `node scripts/workboard-check.mjs` quando o workboard/skills forem alterados; `git diff --check` | `pnpm test`, build, E2E, smoke |
| Um app ou pacote | teste e typecheck do workspace afetado; lint apenas se houver script/regra afetada | suíte raiz, E2E de outros projetos |
| Jornada web/Flow | testes do web; E2E apenas para a jornada alterada | smoke de infraestrutura ou GCP |
| Contrato ou integração entre web, gateway, chatbot e protocolo | testes dos workspaces afetados; `pnpm test` quando a mudança cruzar fronteiras de execução | deploy/GCP |
| Infraestrutura local | teste específico de infra e smoke/compose somente quando arquivos de runtime forem alterados | deploy real |
| Release, PR para ambiente compartilhado ou deploy | suíte raiz, build, validações de integração e smoke/E2E aplicáveis | nenhuma evidência de risco inferior substitui estas verificações |

Uma falha em teste não relacionado deve ser registrada e investigada antes de classificar uma entrega como verde, mas não autoriza rodadas ilimitadas da suíte completa. A repetição deve ter objetivo explícito e limite definido.

## Política de merge

- Merge administrativo, documental ou de governança: verificar árvore, conflitos, workboard quando aplicável e `git diff --check`; não executar suíte de release por padrão.
- Merge de alteração isolada: executar a evidência do projeto afetado uma vez antes do merge. Verificação adicional após o merge apenas se o merge resolver conflitos ou mudar arquivos relevantes.
- Merge de integração multiapp: executar `pnpm test` uma vez no resultado integrado.
- Release/deploy: seguir a última linha da matriz; o pedido deve mencionar release, deploy, GCP ou ambiente compartilhado.

Nenhum merge local implica push, release ou deploy.

## Workboard e tarefas

O `WORKBOARD.md` continuará sendo a fonte de propriedade, estado e bloqueios. Uma linha pode ser marcada `done` quando o escopo declarado daquela linha estiver concluído e possuir a evidência proporcional indicada acima. Pendências de produto, fidelidade visual, GCP ou cobertura ampla devem permanecer em linhas/backlog próprios, não bloquear uma tarefa não relacionada.

O registro de tarefas continua contendo complexidade, tempo, prompt, referência e evidência. Ele não exige que uma tarefa administrativa execute testes de produto.

## Migração e compatibilidade

1. Criar os históricos antes de remover os checklists.
2. Criar os `AGENTS.md` locais apontando para os históricos e para os comandos reais do projeto.
3. Atualizar regras e referências ativas.
4. Remover os `CHECKLIST.md` depois que nenhum documento operacional os tratar como fonte normativa.
5. Manter referências históricas em planos já executados como registro do passado; alterar apenas planos ainda ativos ou índices que instruam trabalho futuro.
6. Atualizar o validador de workboard para não exigir checklists.

## Critérios de aceite

- Não resta `CHECKLIST.md` como instrução operacional em nenhum projeto migrado.
- Cada projeto migrado tem exatamente um `AGENTS.md` local e um histórico em `docs/development-history/`.
- `AGENTS.md` raiz, `workboard-protocol`, `task-tracking` e a SPEC principal não exigem checklist completo para encerrar uma tarefa.
- A matriz acima é a referência única para seleção de validações.
- `node scripts/workboard-check.mjs` continua passando e nenhuma referência operacional aponta para arquivo removido.
- Alterações administrativas podem ser verificadas sem acionar `pnpm test` por padrão.

## Riscos e limites

- A remoção mecânica de todas as menções em planos antigos apagaria contexto histórico; por isso referências de planos já concluídos permanecem como passado documentado.
- A criação de `AGENTS.md` em diretórios de workstreams ativos requer anotação no workboard antes da migração, para não competir com seus donos.
- A matriz reduz custo de validação; não permite ignorar a evidência necessária quando uma mudança altera comportamento, contrato, segurança ou deploy.
