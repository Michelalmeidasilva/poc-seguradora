# Atlas da experiência no WhatsApp

Protótipo HTML independente com **24 jornadas e 284 estados**, incluindo os **34 estados legados**. Abra `atlas-whatsapp.html` diretamente no navegador: é um arquivo único, sem instalação, rede ou backend. `index.html` é a versão de desenvolvimento, que usa os arquivos adjacentes. Para servir localmente: `python3 -m http.server 8765 --directory docs/prototypes/whatsapp-experience`.

## Navegação

- Catálogo lateral de jornadas; busca por título, conteúdo e identificador.
- Seleção de estados, filtros de percurso principal/variações e navegação anterior/próxima.
- Botões da conversa, listas e formulários levam a estados do protótipo.
- Correção de nome/data pela conversa; campos e arquivos de demonstração.
- Galeria de todas as telas e impressão do catálogo.
- Tema claro/escuro do WhatsApp, links por estado e documentos ilustrativos.
- Responsivo; controles por teclado, textos acessíveis e respeito a movimento reduzido.

## Limites do desenho

O catálogo registra as decisões da conversa e os estados previstos, além de reconstruir os 34 estados do documento legado. Não é uma reprodução pixel a pixel do Figma original nem uma integração com a Meta. Flows são aproximações visuais e precisam ser ajustados aos componentes e versões suportados pelo provedor real.

Todos os nomes, preços, datas, contratos e protocolos são fictícios. Não inserir dados pessoais reais. O exemplo familiar usa titular e até três dependentes somente para tornar a composição visual explícita; esse limite **não é uma regra validada**. Arquivos selecionados não são enviados, armazenados ou lidos; apenas o nome fica na memória da página. Recarregar apaga os dados demonstrativos.

Método de identificação, preços, carências, limites, data de cancelamento, restituição, meios de pagamento e acesso aos prestadores ainda precisam ser validados. `CAD` e `PRE` são propostas para lacunas, não decisões aprovadas. Atendimento a interessados também é hipótese.

Os estados são cenários independentes para revisão, com condições ilustrativas em cada tela. Navegação pelo catálogo pode saltar pré-requisitos para facilitar a inspeção. Texto livre usa regras demonstrativas e não um LLM; não calcula elegibilidade nem executa operações. Documentos são exemplos sem validade contratual. Não há chamadas de rede ou telemetria.

## Rastreabilidade

Fontes fornecidas pelo usuário:

- `/Users/user/workspace-personal/Seguradora/project/Chatbot/Chatbot.md`
- `/Users/user/workspace-personal/Seguradora/project/Chatbot/images/template_137.png`
- `/Users/user/workspace-personal/Seguradora/project/Plataforma/Plataforma.md`
- `/Users/user/workspace-personal/Seguradora/project/Apresentações/Corretor Conversacional.md`
- `/Users/user/workspace-personal/Seguradora/project/Reuniões/06-10-2026.md`
- Decisões iterativas de UX registradas na conversa.

`catalog.js` contém conteúdo, decisões, condições e destinos. `app.js` renderiza os estados e interações. `styles.css` concentra o desenho responsivo. Os IDs permitem rastrear as telas na futura organização do Figma.

Depois de alterar os arquivos-fonte, rode `node docs/prototypes/whatsapp-experience/export.mjs` para atualizar a versão em arquivo único. `preview-desktop.png` e `preview-mobile.png` mostram duas vistas inspecionadas.

## Verificação

`node docs/prototypes/whatsapp-experience/verify.mjs` verifica IDs, destinos, estrutura de componentes e os 34 estados legados. A interface também deve ser inspecionada no navegador para verificar renderização, formulários e responsividade.
