# Atlas da experiência no WhatsApp

Protótipo HTML independente com **24 jornadas e 247 estados novos**. Abra `atlas-whatsapp.html` diretamente no navegador: é um arquivo único, sem instalação, rede ou backend. `index.html` é a versão de desenvolvimento, que usa os arquivos adjacentes. Para servir localmente: `python3 -m http.server 8765 --directory docs/prototypes/whatsapp-experience`.

## Autenticação obrigatória

Nenhuma jornada pessoal abre sem o gate demonstrativo de CPF: contratação, contrato, dependentes, pagamentos, documentos, solicitações e uso de assistências vinculadas. A regra cobre links diretos, catálogo e galeria. Conteúdo informativo público e orientação inicial permanecem livres.

Qualquer CPF fictício com **11 dígitos** ou no formato **XXX.XXX.XXX-XX** é aceito em `IDE-08`. A validação confere somente o formato; não calcula dígitos verificadores, não consulta cadastro e não confirma identidade. Não há etapa de código. Navegar para a tela de sucesso não libera acesso. Após enviar o CPF, o pedido original é retomado; a sessão demonstrativa dura 15 minutos em memória e recarregar exige informar CPF novamente.

Esta é uma simulação UX com dados fictícios no HTML. O CPF funciona como porta de entrada demonstrativa, sem autenticação real.

## Serviços fornecidos

As assistências fornecidas são exclusivamente:

- Telemedicina.
- Assistência Funeral: suporte ao titular e aos dependentes.
- Assistência Farmácia: descontos em redes credenciadas.

O catálogo usa “Serviços de Assistência” como rótulo neutro para as telas de gestão de contrato. Os nomes e preços de contratos exibidos são cenários demonstrativos, não uma oferta comercial aprovada.

Seguro Celular, proteção de bens e jornadas de sinistro não fazem parte deste escopo. Contratação, dependentes, pagamentos, documentos e atendimento são jornadas de gestão das assistências, não serviços adicionais. Esta definição substitui as hipóteses anteriores de catálogo; documentos técnicos compartilhados e fontes históricas externas não foram alterados nesta revisão.

Em `DES-01`, “Conhecer produtos” abre **um único Flow**, com cinco etapas internas: serviços → detalhes → planos e comparação → condições do plano → conclusão. Assistência Funeral, Assistência Farmácia e Telemedicina continuam sendo os únicos serviços; os textos de referência `DES-12` a `DES-14` alimentam os detalhes internos. Individual e Familiar têm o mesmo destaque e nenhuma opção pré-selecionada. Preços e composição continuam fictícios.

O botão **Voltar** mantém o Flow aberto e as escolhas durante a exploração. Não há envio de formulário nem retorno ao chat ao selecionar serviço, conhecer detalhes ou comparar planos. Somente a última etapa envia uma decisão: concluir a descoberta (`DES-11`) ou iniciar contratação (`ADE-01`). Iniciar exige o gate de CPF antes da jornada pessoal e não contrata nem cobra. O backend valida estritamente serviço, modalidade e decisão; não aceita destino arbitrário ou o antigo envio parcial de uma escolha. Navegação interna não usa `data_exchange` nem provider real. Os textos não presumem coberturas, valores, carências, redes específicas ou disponibilidade não confirmadas.

A tela `DEP-33` demonstra a jornada do slide: uma mensagem fornece nome, CPF, nascimento e parentesco de João da Silva. `DEP-34` pergunta explicitamente celular e sexo biológico, campos encontrados no legado; nunca infere sexo/gênero. A obrigatoriedade e as opções desses campos precisam de validação do produto. `DEP-06` reúne os dados para revisão.

As lacunas cobertas do legado incluem ainda a central de dúvidas (`FAQ-01` a `FAQ-05`), motivos opcionais de cancelamento (`CAN-13`), encerramento de conversa separado de cancelamento (`FIM-01` e `FIM-02`), acesso demonstrativo após CPF e CPF mascarado na seleção de exclusão. A coleta nativa de contato do WhatsApp não foi reproduzida; nascimento do titular permanece substituído pela entrada demonstrativa aprovada somente por CPF.

## Navegação

`comparativo-legado.html` é um registro histórico independente da comparação entre o Figma e uma versão anterior da proposta; não é uma tela nem define o catálogo atual. Os 45 itens preservam a análise histórica e os links para as 34 telas originais. O cabeçalho esclarece as diferenças: o atlas atual tem somente 24 jornadas/247 telas novas e o CPF é validado apenas por formato. O relatório funciona offline; links externos exigem internet e os links do atlas dependem do arquivo adjacente.

- Catálogo lateral de jornadas; busca por título, conteúdo e identificador.
- Seleção de estados, filtros de percurso principal/variações e navegação anterior/próxima.
- Botões da conversa, listas e formulários levam a estados do protótipo.
- Correção de nome/data pela conversa; campos e arquivos de demonstração.
- Galeria de todas as telas e impressão do catálogo.
- Tema claro/escuro do WhatsApp, links por estado e documentos ilustrativos.
- Responsivo; controles por teclado, textos acessíveis e respeito a movimento reduzido.

## Limites do desenho

O catálogo registra as decisões da conversa e os estados previstos, sem reconstruir as telas antigas. Não é uma reprodução pixel a pixel do Figma original nem uma integração com a Meta. Flows são aproximações visuais e precisam ser ajustados aos componentes e versões suportados pelo provedor real.

Todos os nomes, preços, datas, contratos e protocolos são fictícios. Não inserir dados pessoais reais. O exemplo familiar usa titular e até três dependentes somente para tornar a composição visual explícita; esse limite **não é uma regra validada**. Arquivos selecionados não são enviados, armazenados ou lidos; apenas o nome fica na memória da página. Recarregar apaga os dados demonstrativos.

Duração real de sessão, preços, carências, limites, data de cancelamento, restituição, meios de pagamento e acesso aos prestadores ainda precisam ser validados. `CAD` e `PRE` são propostas para lacunas, não decisões aprovadas. Atendimento a interessados também é hipótese.

Os estados são cenários independentes para revisão, com condições ilustrativas em cada tela. Navegação pelo catálogo pode saltar etapas de preenchimento para inspeção, mas nunca a autenticação. Texto livre usa regras demonstrativas e não um LLM; não calcula elegibilidade nem executa operações. Documentos são exemplos sem validade contratual. Não há chamadas de rede ou telemetria.

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

`node docs/prototypes/whatsapp-experience/verify.mjs` verifica IDs, destinos, estrutura de componentes, ausência de telas legadas e ausência de autenticação por código. A interface também deve ser inspecionada no navegador para verificar renderização, formulários e responsividade.

`node docs/prototypes/whatsapp-experience/experience-e2e-video.mjs` executa o E2E mobile em viewport de 390 × 844, valida acesso CPF-only, descoberta de serviços, quick reply, todas as 24 jornadas/247 telas e overflow horizontal. Também grava um vídeo WebM com legenda de jornada/ID em cada tela. O arquivo é salvo no diretório temporário do sistema; defina `WHATSAPP_VIDEO_OUTPUT` para escolher outro caminho.

Execute `node docs/prototypes/whatsapp-experience/auth-browser-test.js` para testar no Chromium headless com Playwright instalado em `apps/web`. O script serve o atlas em uma porta local temporária e encerra navegador e servidor ao terminar. O comparativo histórico permanece independente e não é uma jornada navegável do atlas.
