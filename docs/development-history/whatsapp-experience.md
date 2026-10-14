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
