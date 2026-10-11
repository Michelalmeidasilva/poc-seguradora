# Verificação do protótipo

Verificações realizadas em 11/10/2026, no protótipo local:

- Catálogo: 24 jornadas, 285 estados, 34 referências legadas e 49 estados com seleção/formulário/revisão.
- Integridade: IDs únicos, destinos existentes, estrutura dos componentes e elementos DOM esperados.
- Renderização: todos os 285 estados renderizados no navegador sem exceções JavaScript.
- Mensagem única (DEP-33): nome João da Silva, nascimento, CPF mascarado e parentesco preservados na revisão DEP-06; tela sem transbordamento a 390 pixels. Nenhuma inferência de sexo ou gênero.
- Inclusão: formulário → revisão → correção de nome pela conversa → nova revisão → processamento → resultado; nome corrigido preservado.
- Aceite: inicia desmarcado; a confirmação permanece bloqueada até o aceite explícito.
- Solicitações: seleção de Seguro Celular leva a pedidos de sinistro, distinguindo o contexto de Assistência Saúde.
- Galeria: 285 telas disponíveis; alternância entre temas claro e escuro aplicada.
- Arquivo único: os 285 estados também renderizados em `atlas-whatsapp.html`, servido localmente, sem exceções JavaScript.
- Rascunho: nome e nascimento preservados ao fechar e reabrir formulário; data exibida corretamente na revisão.
- Escolha de plano: Individual preservado na oferta e revisão, com preço ilustrativo correspondente.
- Responsividade: todos os estados verificados em larguras de 320 e 390 pixels sem transbordamento horizontal. Layout desktop inspecionado a 1440 pixels.
- Dados: uso somente de exemplos fictícios; arquivos não transmitidos; nenhuma API chamada pelo protótipo.

As inspeções validam o comportamento demonstrativo e a integridade do catálogo. Não validam regras contratuais, fidelidade pixel a pixel ao aplicativo WhatsApp ou compatibilidade com uma versão específica de WhatsApp Flows. Esses itens dependem da validação do provedor e do produto antes do Figma final.
