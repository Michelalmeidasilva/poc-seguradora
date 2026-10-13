# Verificação do protótipo — 13/10/2026

Esta revisão remove as 34 telas do grupo LEG do atlas e preserva as 24 jornadas / 247 telas novas, incluindo todos os 64 estados marcados como alternativos (entre eles os 54 anteriormente apontados). O comparativo histórico permanece em `comparativo-legado.html`, separado do catálogo navegável.

## Verificações desta revisão

- RED: `node docs/prototypes/whatsapp-experience/verify.mjs` falhou com `legacy group must not appear in the new prototype` antes de alterar catálogo e aplicação. Uma execução isolada da nova asserção OTP também falhou com `obsolete OTP authentication must not appear`.
- RED comportamental: `node docs/prototypes/whatsapp-experience/auth-browser-test.js` falhou contra o atlas antigo porque `00000000000` permaneceu em IDE-08 em vez de liberar IDE-03.
- GREEN: `node docs/prototypes/whatsapp-experience/verify.mjs` valida 24 jornadas / 247 telas, IDs únicos, todos os destinos, estrutura dos componentes, ausência de LEG e OTP e igualdade entre o catálogo-fonte e o catálogo embutido no standalone.
- Navegador: `node docs/prototypes/whatsapp-experience/auth-browser-test.js` exercita formatos inválidos, qualquer CPF de 11 dígitos ou XXX.XXX.XXX-XX (inclusive sequências repetidas e sem checksum válido), retomada do pedido, links diretos, navegação para sucesso, galeria, expiração de 15 minutos e recarregamento.
- GREEN no Chromium: 207 telas pessoais bloqueadas, 244 telas renderizadas sem exceções JavaScript; expiração, retomada, galeria e recarregamento passaram. A expressão regular do arquivo-fonte também foi executada isoladamente em Node: CPF com pontos/hífen e sem pontuação aceito; letras, espaços internos e tamanho incorreto rejeitados.
- ESLint dos quatro arquivos JavaScript/MJS alterados e `node scripts/workboard-check.mjs` passaram.
- `pnpm test` foi executado e **falhou** no chatbot: 589 testes passaram e três falharam. Em `src/domain/assistance-catalog.test.ts`, falharam “matches canonical IDs, content, modes, actions, and destinations with only the IDE exception” (catálogo gerado ainda contém textos/destinos antigos) e “keeps the canonical source stable and executable without importing browser globals in domain code” (expectativa antiga de 281 IDs). Em `src/e2e.test.ts`, “routes every canonical assistance ID to its expected runtime content and actions” falhou por divergência de destino em ENT-05. A sincronização do catálogo gerado e dessas expectativas exige alteração em apps/chatbot, fora do escopo autorizado desta entrega. As etapas seguintes da suíte geral não foram executadas após essa falha.
- O CPF libera somente a sessão demonstrativa; não consulta cadastro, não identifica titular e não verifica identidade. IDE-02 foi reaproveitada como orientação de formato; IDE-06 renova o acesso por CPF; erro, expiração e divergência continuam disponíveis.
- `node docs/prototypes/whatsapp-experience/export.mjs` regenera o arquivo único offline. O teste de navegador percorre 244 telas; os três estados que encerram a sessão são cobertos no fluxo de expiração ou ficam disponíveis para inspeção manual.
- Limitação operacional: o sandbox bloqueou o servidor local e a escrita do gerador no worktree com EPERM; essas verificações foram executadas com permissão ampliada.
- Nenhum arquivo fora de `docs/prototypes/whatsapp-experience` integra esta alteração. WORKBOARD e o relatório preexistente task-1-report permanecem intocados.

## Evidências anteriores

As inspeções registradas em 12/10/2026 cobriram layout desktop/mobile, inclusão de dependente em mensagem única, revisão/correção, FAQ, cancelamento, documentos, temas e responsividade. Elas antecedem esta revisão e não representam nova inspeção visual de todas as telas modificadas. As referências legadas dessas inspeções foram removidas do catálogo atual.

O protótipo contém somente Telemedicina, Assistência Funeral e Assistência Farmácia. Dados, preços e protocolos são fictícios. As verificações não validam regras contratuais ou compatibilidade com uma versão específica de WhatsApp Flows.
