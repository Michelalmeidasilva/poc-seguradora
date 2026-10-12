# Verificação do protótipo

Verificações realizadas em 12/10/2026, no protótipo local:

- Comparativo independente: 45 itens, sete fluxos legados e 34 links para telas Figma; categorias: 1 lacuna remanescente, 7 equalizadas, 7 regras alteradas, 16 jornadas novas, 8 ampliações e 6 hipóteses. Largura de 390 pixels sem overflow.

- Catálogo: 25 jornadas, 278 estados, 34 referências legadas e 49 estados com seleção/formulário/revisão.
- Autenticação: 241 estados pessoais bloqueados antes da verificação, incluindo links diretos e legado. CPF inválido e código inválido rejeitados; CPF sozinho não libera acesso; navegação para sucesso não autentica. Retomada exata do pedido, expiração automática após 15 minutos e recarregamento verificados. Galeria sem dados pessoais antes do acesso.
- Regressão reproduzível: `auth-browser-test.js`, executado com Playwright `browser_run_code_unsafe` contra o servidor local. O teste falhou antes da implementação e passou depois.
- Suíte geral: `pnpm test` passou fora do sandbox; a primeira execução restrita falhou em testes HTTP por bloqueio de sockets locais (EPERM).
- Integridade: IDs únicos, destinos existentes, estrutura dos componentes e elementos DOM esperados.
- Renderização: todos os 278 estados renderizados no navegador sem exceções JavaScript.
- Mensagem única (DEP-33/DEP-34): nome João da Silva, nascimento, CPF mascarado e parentesco preservados; celular e sexo biológico são perguntados explicitamente antes da revisão DEP-06. Valores informados reaparecem na revisão; sexo/gênero não são inferidos. Telas sem transbordamento a 390 pixels.
- FAQ (FAQ-01–05): os quatro tópicos legados navegam corretamente; conteúdo de carências não inventa prazo.
- Cancelamento: motivo selecionado é preservado no reconhecimento; opção “Prefiro não informar” segue à revisão sem bloquear o fluxo.
- Encerramento e privacidade: conversa termina sem autenticação, mas informa que contrato e pedidos não são alterados; lista de exclusão exibe somente CPF mascarado.
- Inclusão: formulário → revisão → correção de nome pela conversa → nova revisão → processamento → resultado; nome corrigido preservado.
- Aceite: inicia desmarcado; a confirmação permanece bloqueada até o aceite explícito.
- Escopo: somente Telemedicina, Assistência Funeral (titular e dependentes) e Assistência Farmácia (descontos em redes credenciadas). Seguro Celular e os 18 estados de sinistro foram retirados.
- Galeria: 278 telas disponíveis; alternância entre temas claro e escuro aplicada.
- Arquivo único: os 278 estados também renderizados em `atlas-whatsapp.html`, servido localmente, sem exceções JavaScript.
- Rascunho: nome e nascimento preservados ao fechar e reabrir formulário; data exibida corretamente na revisão.
- Escolha de plano: Individual preservado na oferta e revisão, com preço ilustrativo correspondente.
- Responsividade: todos os estados verificados em larguras de 320 e 390 pixels sem transbordamento horizontal. Layout desktop inspecionado a 1440 pixels.
- Dados: uso somente de exemplos fictícios; arquivos não transmitidos; nenhuma API chamada pelo protótipo.

As inspeções validam o comportamento demonstrativo e a integridade do catálogo. Não validam regras contratuais, fidelidade pixel a pixel ao aplicativo WhatsApp ou compatibilidade com uma versão específica de WhatsApp Flows. Esses itens dependem da validação do provedor e do produto antes do Figma final.
