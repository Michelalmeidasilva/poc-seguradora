# Governança enxuta por projeto Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** trocar checklists operacionais por histórico de desenvolvimento e aplicar instruções locais com validação proporcional ao escopo.

**Architecture:** `WORKBOARD.md` continua como fonte de propriedade e estado. `docs/development-history/` passa a guardar entregas, decisões e pendências; cada projeto recebe um `AGENTS.md` local que aponta ao histórico e determina seus comandos de validação. A regra raiz decide o nível de verificação por impacto, sem acionar release para alterações administrativas.

**Tech Stack:** Markdown, Node.js (`scripts/workboard-check.mjs`), pnpm workspace.

**Spec:** `docs/superpowers/specs/2026-10-14-governance-modernization-design.md`

## Global Constraints

- Não alterar código de produto, contratos ou comportamento de runtime.
- Preservar o conteúdo factual dos checklists; mover itens concluídos para entregas e itens abertos para pendências.
- Um merge local nunca implica push, release ou deploy.
- `pnpm test` só é obrigatório para integração multiapp, release/deploy ou alteração que atravesse fronteiras de execução.
- Manter `AGENTS.md` raiz como regra do monorepo e um único `AGENTS.md` em cada projeto migrado.
- Referências em planos já concluídos permanecem históricas; apenas instruções operacionais ativas devem mudar.

## Review Focus

- Um agente que altere somente documentação deve encontrar uma validação curta e não ser instruído a executar a suíte raiz.
- Um agente que altere um único pacote deve encontrar exatamente os comandos daquele pacote, sem inferir E2E de outro app.
- Um workstream com pendência futura deve poder ser concluído sem exigir que backlog não relacionado seja resolvido.
- Não pode sobrar referência operacional para um `CHECKLIST.md` removido.
- O validador do workboard deve continuar aceitando a estrutura e os symlinks de skills depois da remoção dos checklists.

---

### Task 1: Atualizar regras centrais e o validador

**Files:**
- Modify: `AGENTS.md`
- Modify: `.agents/skills/workboard-protocol/SKILL.md`
- Modify: `.agents/skills/monorepo-services/SKILL.md`
- Modify: `docs/superpowers/specs/2026-10-10-whatsapp-chatbot-poc-design.md`
- Modify: `docs/superpowers/specs/2026-10-10-internal-services-contracts.md`
- Modify: `scripts/workboard-check.mjs`
- Test: `scripts/workboard-check.test.mjs`

**Interfaces:**
- Consumes: matriz de validação e modelo documental da SPEC.
- Produces: regra única de conclusão por escopo e validação proporcional, sem dependência de `CHECKLIST.md`.

- [ ] **Step 1: Atualizar a regra raiz e o protocolo**

Substituir as exigências de checklist completo por: “encerrar uma linha quando o escopo declarado estiver concluído e a evidência proporcional à matriz estiver verde”. Incluir a matriz da SPEC no `AGENTS.md` e resumir a mesma regra no workboard protocol. Remover a orientação de atualizar checkbox no mesmo commit.

- [ ] **Step 2: Atualizar os localizadores de serviço e os dois SPECs normativos**

Trocar referências a `CHECKLIST.md` por `docs/development-history/<projeto>.md` e `AGENTS.md` local. Reescrever a seção 15.2 do SPEC principal para “Histórico de desenvolvimento e AGENTS.md local”; reescrever 15.3 para explicar que `done` depende do escopo da linha, não de uma lista global.

- [ ] **Step 3: Remover a premissa de checklist do validador sem reduzir validações de ownership**

Manter no `scripts/workboard-check.mjs` a validação de formato da tabela, caminhos, donos, sobreposição, apontadores e symlinks. Não adicionar qualquer exigência de `CHECKLIST.md`; a mudança só confirma que o validador não trata arquivo removido como requisito.

- [ ] **Step 4: Executar validação focalizada**

Run: `node --test scripts/workboard-check.test.mjs && node scripts/workboard-check.mjs && git diff --check`

Expected: todos os testes do validador passam, workboard válido e nenhum erro de whitespace.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md .agents/skills/workboard-protocol/SKILL.md .agents/skills/monorepo-services/SKILL.md docs/superpowers/specs/2026-10-10-whatsapp-chatbot-poc-design.md docs/superpowers/specs/2026-10-10-internal-services-contracts.md scripts/workboard-check.mjs scripts/workboard-check.test.mjs
git commit -m "docs: adopt proportional validation governance"
```

### Task 2: Migrar checklists para histórico e instruções locais

**Files:**
- Create: `docs/development-history/{chatbot,gateway,web,svc-cotacao,svc-apolice,svc-sinistro,protocol,resilience,infra,whatsapp-experience,web-preview}.md`
- Create: `apps/{chatbot,gateway,web,svc-cotacao,svc-apolice,svc-sinistro}/AGENTS.md`
- Create: `packages/{protocol,resilience}/AGENTS.md`
- Create: `infra/AGENTS.md`
- Create: `docs/prototypes/whatsapp-experience/AGENTS.md`
- Create: `apps/web/preview/AGENTS.md`
- Delete: os `CHECKLIST.md` correspondentes
- Modify: `WORKBOARD.md`

**Interfaces:**
- Consumes: regras centrais da Task 1 e os checklists atuais.
- Produces: um único AGENTS local e um histórico por projeto, sem perda de pendências ou referências úteis.

- [ ] **Step 1: Registrar coordenação de paths ativos**

Atualizar as notas das linhas `chatbot`, `web-chat`, `web-flows`, `ux-whatsapp-prototype` e `web-preview` com a autorização do usuário para criar somente `AGENTS.md` local e migrar seus checklists. Não alterar arquivos de código desses workstreams.

- [ ] **Step 2: Criar históricos de desenvolvimento**

Para cada checklist, converter o título em nome de projeto, itens `[x]` em “Entregas verificadas”, a seção de decisões em “Decisões e limites” e itens `[ ]` em “Pendências conhecidas”. Adicionar uma seção “Validação” com comandos copiados do `package.json` ou da instrução local. Não manter caixas de seleção.

- [ ] **Step 3: Criar um AGENTS local por projeto**

Usar esta estrutura mínima em cada arquivo:

```markdown
# Instruções locais — <projeto>

## Escopo
<responsabilidade e limites do projeto>

## Referências
- Histórico: `../../docs/development-history/<projeto>.md`
- <SPEC/contrato relevante>

## Validação proporcional
- Alteração local: `<comando de teste>` e `<comando de typecheck>`.
- Jornada/integração: <quando rodar E2E, smoke ou suíte raiz>.
- Documentação: `git diff --check` e, se aplicável, `node scripts/workboard-check.mjs`.
```

Os caminhos relativos devem funcionar a partir do diretório do arquivo. Serviços ainda sem implementação devem instruir a não inventar scripts e apontar ao contrato/fake existente.

- [ ] **Step 4: Remover checklists após a cópia**

Excluir somente os arquivos `CHECKLIST.md` que já tiveram seu histórico e AGENTS local criados. Não remover outros documentos ou diretórios.

- [ ] **Step 5: Executar verificações de migração**

Run: `find apps packages infra docs/prototypes -name CHECKLIST.md -print && rg -n "CHECKLIST\.md" AGENTS.md .agents/skills docs/superpowers/specs docs/development-history`

Expected: o primeiro comando não encontra checklists migrados; o segundo encontra apenas menções históricas explícitas, sem regra operacional apontando a arquivo removido.

- [ ] **Step 6: Commit**

```bash
git add -A apps packages infra docs/prototypes docs/development-history WORKBOARD.md
git commit -m "docs: replace project checklists with development history"
```

### Task 3: Atualizar instruções operacionais ativas e fechar a migração

**Files:**
- Modify: `docs/superpowers/plans/2026-10-12-whatsapp-assistance-experience.md`
- Modify: `docs/superpowers/specs/2026-10-14-governance-modernization-design.md`
- Modify: `.agents/metrics/task-execution-log.md`
- Modify: `.agents/metrics/test-execution-timings.md`
- Modify: `WORKBOARD.md`

**Interfaces:**
- Consumes: históricos e AGENTS locais da Task 2.
- Produces: nenhum plano operacional ativo manda atualizar checklist; task e workboard refletem a evidência final.

- [ ] **Step 1: Corrigir o plano operacional ativo**

No plano de assistência de 2026-10-12, trocar passos futuros de atualização de checklist por atualização do histórico de desenvolvimento apenas quando a entrega gerar decisão ou evidência duradoura. Remover listas de arquivos `CHECKLIST.md` das instruções futuras.

- [ ] **Step 2: Validar referências operacionais**

Run: `rg -n "CHECKLIST\.md" AGENTS.md .agents/skills docs/superpowers/specs docs/superpowers/plans/2026-10-12-whatsapp-assistance-experience.md && node scripts/workboard-check.mjs && git diff --check`

Expected: referências restantes, se houver, aparecem somente em explicação de migração ou histórico; workboard e whitespace passam.

- [ ] **Step 3: Registrar o tempo das validações**

Adicionar entradas append-only no log de testes para os comandos da Task 1 e Task 3, com hora, duração e resultado reais. Fechar a linha da tarefa com commits e evidências; nenhuma suíte de produto é executada, pois a mudança é documental/governança.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-10-12-whatsapp-assistance-experience.md docs/superpowers/specs/2026-10-14-governance-modernization-design.md .agents/metrics WORKBOARD.md
git commit -m "docs: complete governance migration"
```

## Self-review

- Cobertura da SPEC: Tasks 1–3 cobrem regras, históricos, AGENTS locais, matriz, política de merge, referências e validação.
- Placeholders: nenhum passo depende de item sem caminho, comando ou resultado esperado.
- Consistência: todos os comandos de validação são proporcionais à governança; nenhuma etapa exige `pnpm test`.
- Review Focus: a Task 1 cobre a decisão de validação; Task 2 cobre comandos locais e ausência de referências removidas; Task 3 cobre a regressão de planos ativos e a evidência final.
