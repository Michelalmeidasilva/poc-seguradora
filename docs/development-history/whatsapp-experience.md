# Histórico de desenvolvimento: protótipo UX WhatsApp

- [x] Catálogo de jornadas e estados discutidos, incluindo propostas não validadas identificadas.
- [x] 34 telas LEG removidas do atlas; 247 telas novas e todos os estados alternativos preservados.
- [x] HTML offline com conversa, listas, Flows e documentos demonstrativos.
- [x] Navegação, revisão, correção, galerias e temas funcionais.
- [x] Layout desktop e mobile inspecionado no navegador.
- [x] IDs, destinos, sintaxe e formatação verificados.
- [x] Entrega e atualização do WORKBOARD registradas em commit.
- [x] Tela de inclusão em mensagem única do slide, com continuidade dos dados na revisão.
- [x] Catálogo e documentação limitados a Telemedicina, Assistência Funeral e Assistência Farmácia; sem Seguro Celular ou jornada de sinistro.
- [x] Gate demonstrativo de CPF nas jornadas pessoais, validação somente por formato, sem código nem consulta de identidade, retomada do pedido e expiração de sessão; testes de link direto, validação, galeria e recarregamento.
- [x] Registro histórico HTML da comparação: 45 itens, sete fluxos e links para as 34 telas Figma; diferenças em relação ao catálogo atual explicitadas.
- [x] Lacunas do legado equalizadas no catálogo: resumo do titular, dados de dependentes sem inferência, FAQ, motivo opcional, encerramento de conversa e CPF mascarado; comparativo e atlas atualizados.
- [x] Descoberta DES-01 consolidada em um único Flow: serviços, detalhes, planos, condições e conclusão; voltar preserva escolhas, sem envio intermediário. Saída para encerramento ou contratação com gate CPF; aplicação e atlas verificados no navegador em 2026-10-13. DES-12–14 permanecem referências de conteúdo, não etapas intermediárias dessa entrada.
- [x] Nomenclatura equalizada: “Serviços de Assistência” identifica somente as telas de gestão; catálogo e HTML standalone mantêm o escopo de serviços aprovado.

- [x] Entrada CPF-only aceita qualquer sequência de 11 dígitos ou formato XXX.XXX.XXX-XX; rejeita outros formatos; testes executáveis de navegador e atlas regenerado.
- [x] Identificação CPF por mensagem no chat, sem Flow nem botão intermediário obrigatório; erro permite retry por texto e sucesso retoma o pedido. Atlas regenerado; auth-browser-test verificou formatos, entrada direta, retomada, 207 telas protegidas, expiração e reload em 2026-10-14.
- [x] E2E mobile percorre 24 jornadas/247 telas em 390 × 844, valida CPF, descoberta, quick reply e overflow, e grava vídeo legendado em WebM.

Nota: o vídeo acima é evidência histórica do atlas. O script foi adaptado ao novo Flow e sua sintaxe verificada; uma nova gravação integral e o vídeo executivo ainda estão pendentes.


## 2026-10-14 — inclusão direta de dependentes

“Incluir dependente” pede CPF do titular somente quando falta na sessão e abre diretamente a lista de contratos. Ao continuar no contrato Familiar, a orientação informa as vagas e os seis dados necessários, permitindo formulário ou mensagens no chat. “Preencher formulário” abre o Flow de cadastro em um clique. Foram removidos os passos intermediários de Continuar inclusão e Abrir formulário.

A coleta conversacional preserva dados válidos, pede apenas campos faltantes/inválidos e abre a revisão após os seis campos, sem inferir sexo biológico. O formulário valida CPF, data real, celular e demais campos; a validação também cobre entradas legadas e a confirmação da revisão. A inclusão só muda o contrato após confirmação explícita. CPF fica mascarado na revisão e no histórico. Outra inclusão limpa os dados anteriores; contratos sem vagas seguem ao resultado apropriado, e a revisão informa as vagas restantes. O atlas offline compartilha o parser do chatbot e valida dados acumulados mesmo ao trocar de formulário para chat.

Evidências: suíte raiz aprovada; correções posteriores revisadas e workspace chatbot 711 testes aprovado, cinco E2E reais/offline aprovados (CPF reutilizado, formulário, chat completo/parcial e troca de canal com celular inválido). Typecheck/lint, validação do atlas e diff verificados; resultados e correções registradas em TASK-20261014-016. Revisão independente aprovada após reforço da validação legada e correção das vagas. Integração em develop e atualização local seguem a entrega autorizada.

Entrega concluída: implementação `dd18c60` integrada em develop pelo merge `7e32933`, sem conflitos. Suíte raiz final aprovada (962 web, 711 chatbot, 177 gateway, 93 protocol, 63 resilience, 116 verificadores e 52 cenários herméticos), tipos/lint aprovados, build Compose concluído. Quatro containers healthy em http://localhost:8080: web 3c3099b4beb6, chatbot a041876ad5de, gateway 4c3de1086442, fake-services 92e5957b0024. Smoke 7/7 e quatro E2E reais contra a stack atualizada passaram; o caso offline passou na rodada isolada e foi excluído somente da execução contra Docker. Sem push/master/GCP; artefatos não rastreados preservados.


## 2026-10-14 — CPF objetivo e retorno direto ao contrato

A identificação pede apenas “Para continuar, informe seu CPF.” e remove “Pedir ajuda” das etapas de CPF. Após validar o formato, a resposta segue diretamente à jornada pendente; a entrada Meu contrato abre a lista Meus contratos. Não há recibo do CPF, mensagem genérica de sucesso nem botões Continuar pedido/Ver contrato entre a identificação e seu destino. Erros de formato continuam permitindo nova tentativa; CPF do titular não é persistido nem repetido nas respostas.

A fonte canônica, o gerador e o atlas offline reproduzem o mesmo caminho. Testes HTTP/handler cobrem destino padrão e pendente, erro sem recibo e descarte do CPF. E2E cobre prompt objetivo, ausência de ajuda/confirmações, CPF formatado e regressão da inclusão de dependentes. Métricas em TASK-20261014-017; conversa de exemplo registrada somente em resumo, sem CPF pessoal.

Entrega concluída: implementação `4eeaf17` integrada em develop pelo merge `76560e0`, sem conflitos. 713 testes chatbot, 962 web e demais workspaces/verificadores aprovados; tipos/lint/build e revisão independente aprovados. Duas execuções web excederam os limites de testes de desempenho (um deles 538 ms para limite 500 ms); o arquivo isolado e toda a suíte com dois workers passaram, sem alterar código ou limites desses testes. Oito E2E reais/offline em portas isoladas e quatro E2E contra http://localhost:8080 passaram. Smoke 7/7, containers healthy: web 8a39b4642396, chatbot 1ece7ef823ed, gateway fddce7802e00, fake-services b1a8739cefe8. Sem push/master/GCP; artefatos não rastreados preservados.
